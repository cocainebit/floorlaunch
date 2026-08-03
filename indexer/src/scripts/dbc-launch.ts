/**
 * Phase 1 REAL launch - creates a live Meteora DBC market on mainnet.
 * Spends real SOL. Runs the full dbcLaunch: pool + fixed-1B mint + metadata,
 * create_external_market attach, push_index + push_mark seed, save listing.
 *
 * Run with mainnet keys:
 *   RPC_URL=<mainnet> ADMIN_KEY_PATH=<mainnet admin> ORACLE_KEY_PATH=<mainnet oracle> \
 *   npx tsx src/scripts/dbc-launch.ts [identifier] [ticker] [name]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dbcLaunch } from "../dbc.js";

const PROGRAM_ID = process.env.PROGRAM_ID ?? "QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM";
const RPC = process.env.RPC_URL;
if (!RPC) throw new Error("set RPC_URL");
const ADMIN = "BNbCZjxJJ3UT75XyvzHA7ZL9yb7kVonw2GR1TDtSGNAX";

const idl = JSON.parse(
  readFileSync(`${homedir()}/floorlaunch/target/idl/floorlaunch.json`, "utf8")
);
idl.address = PROGRAM_ID;

const identifier = process.argv[2] ?? "magiceden:mad_lads";
const ticker = process.argv[3] ?? "MADLADS";
const name = process.argv[4] ?? "Mad Lads Floor";

console.log(`\n== REAL DBC LAUNCH (mainnet, spends SOL) ==`);
console.log(`identifier ${identifier}`);
console.log(`name/ticker ${name} / ${ticker}\n`);

const r = await dbcLaunch(RPC, PROGRAM_ID, idl, {
  identifier,
  meta: {
    ticker,
    name,
    image: null,
    links: {},
    feeReceiver: { kind: "wallet", value: ADMIN },
    launchedBy: ADMIN,
  },
});

console.log(`\n== LAUNCHED ==`);
console.log(`market  ${r.market}`);
console.log(`pool    ${r.pool}`);
console.log(`mint    ${r.mint}`);
console.log(`index   ${r.indexLamports} lamports`);
console.log(`\nsolscan token: https://solscan.io/token/${r.mint}`);
console.log(`solscan pool:  https://solscan.io/account/${r.pool}`);
