/**
 * Localnet launch executor + listing metadata store.
 *
 * POST /dev/launch mirrors the admin-gated v1 listing flow: the UI submits
 * an underlying (from the allowlist catalog) plus token metadata (ticker,
 * name, image, links, fee receiver); this module creates the market with
 * the local admin key, pushes an initial index with the oracle key, and
 * persists the listing metadata for the UI.
 *
 * Guard rails: only enabled against a localhost RPC. On devnet/mainnet the
 * same shape becomes a queue the admin approves.
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";

const LAMPORTS = 1e9;
const BASE_UNITS_PER_NFT = 1_000_000_000_000n;
const CATALOG_PATH = `${homedir()}/floorlaunch/app/src/underlyings.json`;
const LISTINGS_PATH = new URL("../data/listings.json", import.meta.url).pathname;
const ADMIN_KEY = process.env.ADMIN_KEY_PATH ?? `${homedir()}/.config/solana/id.json`;
export const FEE_TREASURY = process.env.FEE_TREASURY ?? "BNbCZjxJJ3UT75XyvzHA7ZL9yb7kVonw2GR1TDtSGNAX";
export const LAUNCH_FEE_LAMPORTS = Number(process.env.LAUNCH_FEE_LAMPORTS ?? 100_000_000);
const ORACLE_KEY = `${homedir()}/floorlaunch/relayer/keys/oracle-sim.json`;

export interface ListingMeta {
  ticker: string;
  name: string;
  image: string | null;
  links: {
    twitter?: string;
    website?: string;
    discord?: string;
    telegram?: string;
    collectiblePage?: string;
  };
  feeReceiver: { kind: "wallet" | "address" | "x"; value: string };
  launchedBy: string;
  launchedAt: number;
  identifier: string;
}

export function loadListings(): Record<string, ListingMeta> {
  try {
    return JSON.parse(readFileSync(LISTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

const kp = (path: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));

async function solUsd(): Promise<number> {
  const r = await fetch(
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d&parsed=true"
  );
  const b: any = await r.json();
  const p = b.parsed[0].price;
  return Number(p.price) * Math.pow(10, p.expo);
}

export function catalogByIdentifier(identifier: string): any | undefined {
  const catalog: any[] = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  return catalog.find((c) => c.identifier === identifier);
}

export async function devLaunch(
  rpcUrl: string,
  programId: string,
  idl: any,
  body: { collectionId?: string; identifier?: string; meta: Omit<ListingMeta, "launchedAt" | "identifier"> }
): Promise<{ market: string; indexLamports: number }> {
  const isLocal = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
  if (!isLocal && !rpcUrl.includes("devnet")) {
    throw new Error("dev launch is localnet/devnet-only");
  }
  const catalog: any[] = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const u = body.identifier
    ? catalog.find((c) => c.identifier === body.identifier)
    : catalog.find((c) => c.collectionId === body.collectionId);
  if (!u) throw new Error("unknown underlying");

  // Initial index in lamports per unit, from the allowlist snapshot.
  let indexLamports: number;
  if (u.kind === "nft") {
    indexLamports = Math.round(u.snapshot.floorSol * LAMPORTS);
  } else {
    const usd = u.usdPrice ?? u.snapshot.ccFloorUsd;
    indexLamports = Math.round((usd / (await solUsd())) * LAMPORTS);
  }

  const admin = kp(ADMIN_KEY);
  const oracle = kp(ORACLE_KEY);
  const connection = new Connection(rpcUrl, "confirmed");

  // Launch fee: 0.1 SOL to the protocol treasury, paid by the launching
  // wallet in a separate tx the UI sends first. Localnet skips it.
  if (!isLocal) {
    const sig = (body as any).feePaymentSig;
    if (!sig) throw new Error("launch fee payment required (0.1 SOL)");
    const prior = loadListings();
    if (Object.values(prior).some((l: any) => l.feePaymentSig === sig)) {
      throw new Error("fee payment already used");
    }
    const ftx = await connection.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!ftx || ftx.meta?.err) throw new Error("fee payment tx not found");
    if (ftx.blockTime && Date.now() / 1000 - ftx.blockTime > 900) {
      throw new Error("fee payment too old");
    }
    const keys = ftx.transaction.message.getAccountKeys().staticAccountKeys;
    const ti = keys.findIndex((k) => k.toBase58() === FEE_TREASURY);
    if (ti < 0) throw new Error("fee payment does not pay the treasury");
    const delta = ftx.meta!.postBalances[ti] - ftx.meta!.preBalances[ti];
    if (delta < LAUNCH_FEE_LAMPORTS) throw new Error("fee payment below 0.1 SOL");
    if (keys[0].toBase58() !== body.meta.launchedBy) {
      throw new Error("fee paid by a different wallet than the launcher");
    }
  }
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);
  const pid = new PublicKey(programId);
  // Every launch gets its own market, even for the same underlying: the
  // on-chain collection id is a fresh hash of identifier + entropy, and
  // the underlying association lives in the listing metadata.
  const collection = new PublicKey(
    createHash("sha256")
      .update(`${u.identifier}|${Date.now()}|${randomBytes(8).toString("hex")}`)
      .digest()
  );
  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], pid);
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), collection.toBuffer()],
    pid
  );
  const [itemReservePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("items"), marketPda.toBuffer()],
    pid
  );

  // Every launch prices identically, like any launchpad: 1B token
  // supply, 25 SOL market cap open, migration once the curve has raised
  // 100 SOL so the AMM pool starts with 100 SOL inside it. The
  // underlying's price never touches the curve. vSol = 25 SOL virtual
  // against the full 1B supply sells 800M tokens over the 100 SOL raise
  // and closes at 0.625 SOL per 1M tokens (~625 SOL market cap). The
  // oracle index is LAUNCH-SCALED: one unit (1M tokens) is defined as
  // worth 0.625 SOL (the migration price) at launch and moves with the
  // collectible from there, so premium, funding and the breaker stay
  // meaningful and the AMM seeds at premium zero. unitsPerItemMicro
  // carries the item's real size for item swaps.
  const UNIT_LAMPORTS_AT_LAUNCH = 625_000_000; // 0.625 SOL per 1M tokens
  const unitsPerItemMicro = Math.max(
    1,
    Math.round((indexLamports / UNIT_LAMPORTS_AT_LAUNCH) * 1e6)
  );
  {
    const vSol = 25n * BigInt(LAMPORTS);
    const vTok = 1_000_000_000n * 1_000_000n; // full 1B supply on the curve
    const params = {
      indexWindowSecs: 30,
      minPushIntervalSecs: 0,
      breakerBps: 3000,
      maxIndexAgeSecs: 3600,
      markWindowSecs: 60,
      fundingKBps: 10000,
      maxFundingBpsPerDay: 10000,
      minCrankIntervalSecs: 1,
      initialCrBps: 15000,
      maintenanceCrBps: 12000,
      liqBonusBps: 500,
      maxOpenInterest: new BN("400000000000000"),
      // Room for 25 deposited items at launch scale.
      itemReserve: new BN(String(BigInt(unitsPerItemMicro) * 1_000_000n * 25n)),
      unitsPerItemMicro: new BN(String(unitsPerItemMicro)),
      curveFeeBps: 70,
      ammFeeBps: 70,
      graduationTargetSol: new BN(100).mul(new BN(LAMPORTS)),
      // The full raise seeds the pool: migration means 100 SOL inside it.
      insuranceShareBps: 0,
      curveVirtualSol: new BN(vSol.toString()),
      curveVirtualTokens: new BN(vTok.toString()),
    };
    await program.methods
      .createMarket(collection, params as any)
      .accountsPartial({
        global: globalPda,
        admin: admin.publicKey,
        market: marketPda,
        itemReserve: itemReservePda,
      })
      .rpc();
    await program.methods
      .pushIndex(new BN(UNIT_LAMPORTS_AT_LAUNCH))
      .accountsPartial({
        global: globalPda,
        oracleAuthority: oracle.publicKey,
        market: marketPda,
      })
      .signers([oracle])
      .rpc();
  }

  // Demo copies of the underlying: three item NFTs minted to the
  // launcher's wallet and registered for the market, standing in for
  // vaulted-card / collection NFTs until collection verification.
  const itemMints: string[] = [];
  const pace = () => new Promise((r) => setTimeout(r, rpcUrl.includes("devnet") ? 1_500 : 0));
  try {
    const spl = await import("@solana/spl-token");
    const web3 = await import("@solana/web3.js");
    const adminKp = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ADMIN_KEY, "utf8"))));
    const owner = new PublicKey(body.meta.launchedBy);
    for (let i = 0; i < 3; i++) {
      await pace();
      const mint = await spl.createMint(connection, adminKp, adminKp.publicKey, null, 0);
      const ata = await spl.getOrCreateAssociatedTokenAccount(connection, adminKp, mint, owner);
      await spl.mintTo(connection, adminKp, mint, ata.address, adminKp, 1);
      const [reg] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), marketPda.toBuffer(), mint.toBuffer()],
        pid
      );
      await program.methods
        .registerItem()
        .accountsPartial({
          global: globalPda,
          admin: admin.publicKey,
          market: marketPda,
          itemMint: mint,
          registration: reg,
        })
        .rpc();
      itemMints.push(mint.toBase58());
    }
  } catch (e) {
    console.log("demo item setup failed:", String((e as any).message).slice(0, 80));
  }

  const listings = loadListings();
  listings[marketPda.toBase58()] = {
    ...body.meta,
    identifier: u.identifier,
    feePaymentSig: (body as any).feePaymentSig ?? null,
    itemMints,
    indexAtLaunchLamports: indexLamports,
    unitsPerItemMicro,
    launchedAt: Math.floor(Date.now() / 1000),
  } as any;
  writeFileSync(LISTINGS_PATH, JSON.stringify(listings, null, 2));
  return { market: marketPda.toBase58(), indexLamports };
}
