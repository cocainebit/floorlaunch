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
const ADMIN_KEY = `${homedir()}/.config/solana/id.json`;
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
  if (!rpcUrl.includes("127.0.0.1") && !rpcUrl.includes("localhost")) {
    throw new Error("dev launch is localnet-only");
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

  {
    // Curve opens at the live index; deep virtuals keep launch premium sane.
    const vSol = 100n * BigInt(LAMPORTS);
    const vTok = (vSol * BASE_UNITS_PER_NFT) / BigInt(indexLamports);
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
      maxOpenInterest: new BN("100000000000000"),
      curveFeeBps: 70,
      ammFeeBps: 70,
      graduationTargetSol: new BN(10).mul(new BN(LAMPORTS)),
      insuranceShareBps: 1000,
      curveVirtualSol: new BN(vSol.toString()),
      curveVirtualTokens: new BN(vTok.toString()),
    };
    await program.methods
      .createMarket(collection, params as any)
      .accountsPartial({
        global: globalPda,
        admin: admin.publicKey,
        market: marketPda,
      })
      .rpc();
    await program.methods
      .pushIndex(new BN(indexLamports))
      .accountsPartial({
        global: globalPda,
        oracleAuthority: oracle.publicKey,
        market: marketPda,
      })
      .signers([oracle])
      .rpc();
  }

  const listings = loadListings();
  listings[marketPda.toBase58()] = {
    ...body.meta,
    identifier: u.identifier,
    launchedAt: Math.floor(Date.now() / 1000),
  };
  writeFileSync(LISTINGS_PATH, JSON.stringify(listings, null, 2));
  return { market: marketPda.toBase58(), indexLamports };
}
