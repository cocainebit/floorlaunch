/**
 * Identity fee escrow, program-PDA edition.
 *
 * Each identity (an X handle, a YouTube channel, an Elite Fourum user)
 * maps to a program-derived system account seeded by
 * sha256("platform:handle"). No key exists for it anywhere: fees for
 * unverified identities accumulate via plain transfers, and funds can
 * only leave through the program's admin-signed release_escrow
 * instruction, invoked here after ownership verification.
 *
 * Verification is nonce-in-bio: we issue a nonce, the owner puts it in
 * their public bio/description, we fetch and check. Per-platform:
 *   youtube      channel page description (public fetch)
 *   elitefourum  Discourse public user JSON (bio_raw)
 *   x            no public bio API; manual/admin approval until X OAuth
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { resolveSecretKey } from "./keypair.js";

const STORE = new URL("../data/escrows.json", import.meta.url).pathname;
const ADMIN_KEY = `${homedir()}/.config/solana/id.json`;

export type Platform = "x" | "youtube" | "elitefourum";

export interface EscrowEntry {
  platform: Platform;
  handle: string;
  escrowPubkey: string;
  createdAt: number;
  verified: boolean;
  verifiedWallet?: string;
  pendingWallet?: string;
  nonce?: string;
  sweeps: { sig: string; lamports: number; at: number }[];
}

const key = (p: Platform, h: string) => `${p}:${h.toLowerCase().replace(/^@/, "")}`;
const idHash = (p: Platform, h: string) =>
  createHash("sha256").update(key(p, h)).digest();

function load(): Record<string, EscrowEntry> {
  try {
    return JSON.parse(readFileSync(STORE, "utf8"));
  } catch {
    return {};
  }
}
const save = (d: Record<string, EscrowEntry>) =>
  writeFileSync(STORE, JSON.stringify(d, null, 2));

let programId: PublicKey | null = null;
let cachedIdl: any = null;
export function initEscrow(idl: any) {
  cachedIdl = structuredClone(idl);
  programId = new PublicKey(idl.address);
}

export function escrowAddress(platform: Platform, handle: string): PublicKey {
  if (!programId) throw new Error("escrow module not initialized");
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), idHash(platform, handle)],
    programId
  )[0];
}

export function getOrCreateEscrow(platform: Platform, handle: string) {
  const d = load();
  const k = key(platform, handle);
  if (!d[k]) {
    d[k] = {
      platform,
      handle: handle.replace(/^@/, ""),
      escrowPubkey: escrowAddress(platform, handle).toBase58(),
      createdAt: Math.floor(Date.now() / 1000),
      verified: false,
      sweeps: [],
    };
    save(d);
  }
  return d[k];
}

export function startVerification(platform: Platform, handle: string, wallet: string) {
  const d = load();
  const k = key(platform, handle);
  if (!d[k]) throw new Error("no escrow for this identity");
  new PublicKey(wallet); // validates
  const nonce = `floorlaunch-${randomBytes(6).toString("hex")}`;
  d[k].nonce = nonce;
  d[k].pendingWallet = wallet;
  save(d);
  const where: Record<Platform, string> = {
    youtube: "your channel description",
    elitefourum: "your Elite Fourum profile About Me",
    x: "your X bio (then an admin confirms, until X API verification ships)",
  };
  return { nonce, instructions: `Add "${nonce}" to ${where[platform]}, then check verification.` };
}

async function fetchBio(platform: Platform, handle: string): Promise<string | null> {
  try {
    if (platform === "youtube") {
      const r = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}/about`, {
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!r.ok) return null;
      return await r.text();
    }
    if (platform === "elitefourum") {
      const r = await fetch(`https://www.elitefourum.com/u/${encodeURIComponent(handle)}.json`, {
        headers: { accept: "application/json" },
      });
      if (!r.ok) return null;
      const j: any = await r.json();
      return JSON.stringify(j.user?.bio_raw ?? "") + JSON.stringify(j.user?.bio_cooked ?? "");
    }
    return null; // x: manual until OAuth
  } catch {
    return null;
  }
}

export async function checkVerification(
  rpcUrl: string,
  platform: Platform,
  handle: string,
  opts: { adminOverride?: boolean } = {}
) {
  const d = load();
  const e = d[key(platform, handle)];
  if (!e) throw new Error("no escrow for this identity");
  if (!e.nonce || !e.pendingWallet) throw new Error("verification not started");

  let found = false;
  if (opts.adminOverride) {
    found = true;
  } else {
    const bio = await fetchBio(platform, e.handle);
    found = bio !== null && bio.includes(e.nonce);
    if (platform === "x" && !found) {
      return { verified: false, reason: "x verification is admin-approved until X API credentials exist" };
    }
  }
  if (!found) return { verified: false, reason: "nonce not found in public bio yet" };

  e.verified = true;
  e.verifiedWallet = e.pendingWallet;
  save(d);
  const sweep = await sweepEscrow(rpcUrl, platform, e.handle);
  return { verified: true, wallet: e.verifiedWallet, sweep };
}

/** Release the escrow PDA to the verified wallet via the program. */
export async function sweepEscrow(rpcUrl: string, platform: Platform, handle: string) {
  const d = load();
  const e = d[key(platform, handle)];
  if (!e?.verified || !e.verifiedWallet) throw new Error("not verified");
  if (!cachedIdl) throw new Error("escrow module not initialized");

  const connection = new Connection(rpcUrl, "confirmed");
  const escrow = escrowAddress(platform, e.handle);
  const bal = await connection.getBalance(escrow);
  if (bal <= 0) return { swept: 0 };

  const secret = resolveSecretKey({
    keyEnv: "ADMIN_KEYPAIR",
    pathEnv: "ADMIN_KEY_PATH",
    defaultPath: ADMIN_KEY,
  });
  if (!secret) throw new Error("admin signer not configured");
  const admin = Keypair.fromSecretKey(secret);
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(cachedIdl, provider);
  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], programId!);
  const sig = await program.methods
    .releaseEscrow(Array.from(idHash(platform, e.handle)) as any, null)
    .accountsPartial({
      global: globalPda,
      admin: admin.publicKey,
      escrow,
      recipient: new PublicKey(e.verifiedWallet),
    })
    .rpc();
  e.sweeps.push({ sig, lamports: bal, at: Math.floor(Date.now() / 1000) });
  save(d);
  return { swept: bal / 1e9, sig };
}

export function listEscrows() {
  return load();
}

// ---------- X (Twitter) OAuth 2.0 verification ----------
//
// Ownership is proven by an OAuth login, not a bio nonce: the creator
// authorizes the app, we read their verified @username from /2/users/me, and
// if it matches the handle we release the escrow. Stateless PKCE (the code
// verifier is derived from a signed state via HMAC) so the /start and
// /callback requests can land on different machines with no shared storage.

const b64url = (b: Buffer) => b.toString("base64url");
const xSecret = () =>
  process.env.X_STATE_SECRET ?? process.env.X_CLIENT_SECRET ?? "commas-dev-secret";
const xCallback = () =>
  `${(process.env.PUBLIC_BASE_URL ?? "https://commas-indexer.fly.dev").replace(/\/+$/, "")}/verify-x/callback`;
const xFallbackReturn = () => process.env.APP_RETURN_URL ?? "https://launch.commas.art";
const RETURN_ALLOW = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/([a-z0-9-]+\.)*commas\.art$/,
];

function safeReturn(url?: string): string {
  if (!url) return xFallbackReturn();
  try {
    const u = new URL(url);
    if (RETURN_ALLOW.some((re) => re.test(u.origin))) return u.origin + u.pathname;
  } catch {}
  return xFallbackReturn();
}

function signState(obj: unknown): string {
  const payload = b64url(Buffer.from(JSON.stringify(obj)));
  const sig = b64url(createHmac("sha256", xSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}
function verifyState(state: string): any | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expect = b64url(createHmac("sha256", xSecret()).update(payload).digest());
  if (sig !== expect) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}
const pkceVerifier = (state: string) =>
  b64url(createHmac("sha256", xSecret()).update(`pkce:${state}`).digest());

/** Build the X authorize URL for a handle+wallet; throws if X isn't configured. */
export function startXOAuth(handle: string, wallet: string, returnTo?: string): string {
  if (!process.env.X_CLIENT_ID) throw new Error("X OAuth not configured on this indexer");
  new PublicKey(wallet); // validate
  const clean = handle.replace(/^@/, "");
  if (!clean) throw new Error("handle required");
  const state = signState({
    handle: clean,
    wallet,
    returnTo: safeReturn(returnTo),
  });
  const verifier = pkceVerifier(state);
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: xCallback(),
    scope: "users.read tweet.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${p.toString()}`;
}

/** Handle the X redirect: exchange the code, confirm the @username, release. */
export async function handleXCallback(
  rpcUrl: string,
  code: string,
  state: string
): Promise<{ ok: boolean; returnTo: string; handle?: string; error?: string }> {
  const parsed = verifyState(state);
  const returnTo = parsed?.returnTo ?? xFallbackReturn();
  if (!parsed || !code) return { ok: false, returnTo, error: "bad_state" };
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
    return { ok: false, returnTo, error: "x_not_configured" };
  }
  const verifier = pkceVerifier(state);
  const basic = Buffer.from(
    `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
  ).toString("base64");
  const tokRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: xCallback(),
      code_verifier: verifier,
    }).toString(),
  });
  if (!tokRes.ok) return { ok: false, returnTo, error: "token_exchange_failed" };
  const tok: any = await tokRes.json();
  const meRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) return { ok: false, returnTo, error: "user_fetch_failed" };
  const me: any = await meRes.json();
  const username: string | undefined = me?.data?.username;
  if (!username || username.toLowerCase() !== String(parsed.handle).toLowerCase()) {
    return { ok: false, returnTo, error: "handle_mismatch", handle: parsed.handle };
  }
  // Verified: record ownership and release the accrued fees to the wallet.
  getOrCreateEscrow("x", parsed.handle);
  const d = load();
  const e = d[key("x", parsed.handle)];
  e.verified = true;
  e.verifiedWallet = parsed.wallet;
  save(d);
  try {
    await sweepEscrow(rpcUrl, "x", parsed.handle);
  } catch {
    // fees released on next sweep; ownership is already recorded.
  }
  return { ok: true, returnTo, handle: parsed.handle };
}
