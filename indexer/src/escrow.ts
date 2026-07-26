/**
 * Identity fee escrow: fees for launches whose fee receiver is a social
 * identity (an X handle, a YouTube channel, an Elite Fourum user) accrue
 * to a server-held escrow keypair until the identity proves ownership,
 * then sweep to their wallet.
 *
 * Verification is nonce-in-bio: we issue a nonce, the owner puts it in
 * their public bio/description, we fetch and check. Per-platform:
 *   youtube      channel page description (public fetch)
 *   elitefourum  Discourse public user JSON (bio_raw)
 *   x            no public bio API; manual/admin approval until X OAuth
 *                credentials exist
 *
 * Escrow keys live server-side (data/escrows.json). In production this
 * moves to a KMS + a program-owned escrow PDA; the interface stays.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const STORE = new URL("../data/escrows.json", import.meta.url).pathname;

export type Platform = "x" | "youtube" | "elitefourum";

export interface EscrowEntry {
  platform: Platform;
  handle: string;
  escrowPubkey: string;
  escrowSecret: number[];
  createdAt: number;
  verified: boolean;
  verifiedWallet?: string;
  pendingWallet?: string;
  nonce?: string;
  sweeps: { sig: string; lamports: number; at: number }[];
}

const key = (p: Platform, h: string) => `${p}:${h.toLowerCase().replace(/^@/, "")}`;

function load(): Record<string, EscrowEntry> {
  try {
    return JSON.parse(readFileSync(STORE, "utf8"));
  } catch {
    return {};
  }
}
const save = (d: Record<string, EscrowEntry>) =>
  writeFileSync(STORE, JSON.stringify(d, null, 2));

/** Public view: never expose the secret. */
const pub = ({ escrowSecret, ...rest }: EscrowEntry) => rest;

export function getOrCreateEscrow(platform: Platform, handle: string) {
  const d = load();
  const k = key(platform, handle);
  if (!d[k]) {
    const kp = Keypair.generate();
    d[k] = {
      platform,
      handle: handle.replace(/^@/, ""),
      escrowPubkey: kp.publicKey.toBase58(),
      escrowSecret: [...kp.secretKey],
      createdAt: Math.floor(Date.now() / 1000),
      verified: false,
      sweeps: [],
    };
    save(d);
  }
  return pub(d[k]);
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
  const k = key(platform, handle);
  const e = d[k];
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

/** Move the escrow's SOL (minus fee headroom) to the verified wallet. */
export async function sweepEscrow(rpcUrl: string, platform: Platform, handle: string) {
  const d = load();
  const e = d[key(platform, handle)];
  if (!e?.verified || !e.verifiedWallet) throw new Error("not verified");
  const connection = new Connection(rpcUrl, "confirmed");
  const kp = Keypair.fromSecretKey(Uint8Array.from(e.escrowSecret));
  const bal = await connection.getBalance(kp.publicKey);
  // The escrow signs and pays the 5000-lamport fee; sweep everything else
  // so the account closes to zero (dust below rent-exemption is invalid).
  const amount = bal - 5_000;
  if (amount <= 0) return { swept: 0 };
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(e.verifiedWallet),
      lamports: amount,
    })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
  e.sweeps.push({ sig, lamports: amount, at: Math.floor(Date.now() / 1000) });
  save(d);
  return { swept: amount / 1e9, sig };
}

export function listEscrows() {
  return Object.fromEntries(Object.entries(load()).map(([k, v]) => [k, pub(v)]));
}
