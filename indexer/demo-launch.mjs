import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

const K = readFileSync(`${process.env.HOME}/Desktop/floorlaunch-rpc.txt`,"utf8").match(/[0-9a-f]{8}-[0-9a-f-]{27}/)[0];
const RPC = `https://mainnet.helius-rpc.com/?api-key=${K}`;
const INDEXER = "https://commas-indexer.fly.dev";
const TREASURY_KP = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/commas-mainnet-admin.json`,"utf8"))));
const FEE_TREASURY = new PublicKey("BNbCZjxJJ3UT75XyvzHA7ZL9yb7kVonw2GR1TDtSGNAX");
const conn = new Connection(RPC, "confirmed");

// fresh launcher (fee payer + launchedBy)
const launcher = Keypair.generate();
console.log("launcher:", launcher.publicKey.toBase58());

// 1. fund launcher from treasury
console.log("1/3 funding launcher 0.15 SOL from treasury...");
let tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: TREASURY_KP.publicKey, toPubkey: launcher.publicKey, lamports: Math.round(0.15*LAMPORTS_PER_SOL) }));
let sig = await conn.sendTransaction(tx, [TREASURY_KP]); await conn.confirmTransaction(sig, "confirmed");
console.log("   funded:", sig);

// 2. launcher pays 0.1 SOL launch fee to the treasury
console.log("2/3 paying 0.1 SOL launch fee...");
tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: launcher.publicKey, toPubkey: FEE_TREASURY, lamports: Math.round(0.1*LAMPORTS_PER_SOL) }));
const feeSig = await conn.sendTransaction(tx, [launcher]); await conn.confirmTransaction(feeSig, "confirmed");
console.log("   fee paid:", feeSig);

// 3. create the market via the indexer
console.log("3/3 creating market via /dev/launch...");
const body = {
  identifier: "magiceden:mad_lads",
  feePaymentSig: feeSig,
  meta: {
    ticker: "flMAD",
    name: "Mad Lads Floor",
    image: "/underlyings/mad_lads.png",
    links: { description: "Synthetic index tracking the Mad Lads NFT floor." },
    feeReceiver: { kind: "address", value: launcher.publicKey.toBase58() },
    launchedBy: launcher.publicKey.toBase58(),
  },
};
const res = await fetch(`${INDEXER}/dev/launch`, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) });
const out = await res.json();
console.log("   response:", JSON.stringify(out));
if (out.market) console.log(`\n✅ MARKET CREATED: ${out.market}\n   explorer: localhost:3000/token/${out.market}`);
