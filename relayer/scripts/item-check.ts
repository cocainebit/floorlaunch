import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "http://127.0.0.1:8899";
const API = "http://127.0.0.1:8787";
const IDL_PATH = new URL("../../target/idl/floorlaunch.json", import.meta.url).pathname;

async function main() {
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))));
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(JSON.parse(readFileSync(IDL_PATH, "utf8")), provider);

  const listings = await (await fetch(`${API}/listings`)).json();
  const [market, meta]: any = Object.entries(listings)[0];
  const marketPda = new PublicKey(market);
  const itemMint = new PublicKey(meta.itemMints[0]);
  const m: any = await (program.account as any).market.fetch(marketPda);
  const mintPda = new PublicKey(m.synthMint);
  const pid = program.programId;
  const [itemReserve] = PublicKey.findProgramAddressSync([Buffer.from("items"), marketPda.toBuffer()], pid);
  const [registration] = PublicKey.findProgramAddressSync([Buffer.from("item"), marketPda.toBuffer(), itemMint.toBuffer()], pid);
  const userToken = anchor.utils.token.associatedAddress({ mint: mintPda, owner: admin.publicKey });
  const userItem = anchor.utils.token.associatedAddress({ mint: itemMint, owner: admin.publicKey });
  const escrowItem = anchor.utils.token.associatedAddress({ mint: itemMint, owner: marketPda });

  const before = Number((await connection.getTokenAccountBalance(userToken)).value.amount);
  await program.methods.depositItem().accountsPartial({
    market: marketPda, synthMint: mintPda, itemMint, registration,
    itemReserve, userToken, userItem, escrowItem, user: admin.publicKey,
  }).rpc();
  const after = Number((await connection.getTokenAccountBalance(userToken)).value.amount);
  const got = (after - before) / 1e6;
  const expected = (Number(m.indexTwap) * meta.unitsPerItemMicro / 1e6) / Number(m.markEma) * 1e6;
  console.log(`deposit gave ${got.toFixed(0)} tokens, expected ~${expected.toFixed(0)} (k=${meta.unitsPerItemMicro / 1e6} units/item)`);
  const valueSol = got / 1e6 * Number(m.markEma) / 1e9;
  console.log(`value at mark: ${valueSol.toFixed(4)} SOL vs card 0.44 SOL -> ${Math.abs(valueSol - 0.44) < 0.05 ? "PASS" : "CHECK"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
