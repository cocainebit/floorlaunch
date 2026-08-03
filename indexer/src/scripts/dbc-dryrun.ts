/**
 * Phase 1 DBC dry run - NO SPEND.
 *
 * Builds the real Meteora `createConfigAndPool` transaction (fixed 1B, 0.7% fee,
 * collectible metadata) and SIMULATES it against mainnet. Simulation runs the tx
 * against the live Meteora program without committing, so it catches bad config
 * params / account errors before any real launch. Never sends.
 *
 * Run: RPC_URL=<mainnet> npx tsx src/scripts/dbc-dryrun.ts [identifier]
 * Defaults RPC to public mainnet-beta if RPC_URL is unset.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { buildConfig } from "../dbc.js";
import { catalogByIdentifier, FEE_TREASURY } from "../launch.js";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const ADMIN_PATH =
  process.env.ADMIN_KEY_PATH ?? `${homedir()}/.config/solana/commas-mainnet-admin.json`;

function loadKey(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const identifier = process.argv[2] ?? "magiceden:mad_lads";
  const u = catalogByIdentifier(identifier);
  if (!u) throw new Error(`unknown underlying: ${identifier}`);

  const connection = new Connection(RPC, "confirmed");
  const admin = loadKey(ADMIN_PATH);
  const bal = await connection.getBalance(admin.publicKey);

  console.log(`\n== DBC dry run (NO SPEND) ==`);
  console.log(`rpc         ${RPC.replace(/api-key=[\w-]+/, "api-key=***")}`);
  console.log(`admin       ${admin.publicKey.toBase58()}  (${(bal / 1e9).toFixed(4)} SOL)`);
  console.log(`underlying  ${u.name}  [${identifier}]`);

  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const config = Keypair.generate();
  const baseMint = Keypair.generate();
  const metadataUri = `https://commas-indexer.fly.dev/token-metadata/${baseMint.publicKey.toBase58()}.json`;

  const configParams = buildConfig();
  console.log(`\nbuilding createConfigAndPool tx...`);
  console.log(`  config    ${config.publicKey.toBase58()}`);
  console.log(`  baseMint  ${baseMint.publicKey.toBase58()}`);
  console.log(`  name/sym  ${u.name} / ${(u.symbol ?? "TICK").toUpperCase()}`);
  console.log(`  uri       ${metadataUri}`);

  const tx = await client.partner.createConfigAndPool({
    config: config.publicKey,
    feeClaimer: new PublicKey(FEE_TREASURY),
    leftoverReceiver: admin.publicKey,
    quoteMint: WSOL,
    payer: admin.publicKey,
    ...configParams,
    preCreatePoolParam: {
      name: u.name,
      symbol: (u.symbol ?? "TICK").toUpperCase().slice(0, 10),
      uri: metadataUri,
      poolCreator: admin.publicKey,
      baseMint: baseMint.publicKey,
    },
  });

  tx.feePayer = admin.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const pool = deriveDbcPoolAddress(WSOL, baseMint.publicKey, config.publicKey);
  console.log(`  pool      ${pool.toBase58()}`);
  console.log(`  ixs       ${tx.instructions.length}`);

  console.log(`\nsimulating (no send)...`);
  const sim = await connection.simulateTransaction(tx, [admin, config, baseMint]);
  const { err, logs, unitsConsumed } = sim.value;
  if (err) {
    console.log(`\nRESULT: FAIL  err=${JSON.stringify(err)}`);
    console.log((logs ?? []).slice(-25).map((l) => "  " + l).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\nRESULT: OK  the DBC launch tx simulates cleanly.`);
    console.log(`  CU consumed ${unitsConsumed ?? "?"}`);
    console.log(`  (pool + fixed-1B mint + metadata would be created on a real send)`);
  }
}

main().catch((e) => {
  console.error("\nDRY RUN ERROR:", e?.message ?? e);
  process.exitCode = 1;
});
