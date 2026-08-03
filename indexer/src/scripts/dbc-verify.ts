/**
 * Verify a launched DBC market on-chain (read-only).
 * RPC_URL=<mainnet> npx tsx src/scripts/dbc-verify.ts <mint> <pool>
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient, getPriceFromSqrtPrice, TokenDecimal } from "@meteora-ag/dynamic-bonding-curve-sdk";

const RPC = process.env.RPC_URL;
if (!RPC) throw new Error("set RPC_URL");
const conn = new Connection(RPC, "confirmed");
const mint = new PublicKey(process.argv[2]);
const pool = process.argv[3];

const supply = await conn.getTokenSupply(mint);
const info: any = await conn.getParsedAccountInfo(mint);
const p = info.value?.data?.parsed?.info;

console.log(`\n== mint ${mint.toBase58()} ==`);
console.log(`supply         ${supply.value.uiAmountString}  (decimals ${supply.value.decimals})`);
console.log(`mintAuthority   ${p?.mintAuthority ?? "null (revoked)"}`);
console.log(`freezeAuthority ${p?.freezeAuthority ?? "null"}`);

if (pool) {
  const client = DynamicBondingCurveClient.create(conn, "confirmed");
  const vp: any = await client.state.getPool(pool);
  const ps = vp?.poolState;
  if (ps) {
    const price = Number(getPriceFromSqrtPrice(ps.sqrtPrice, TokenDecimal.SIX, TokenDecimal.NINE).toString());
    console.log(`\n== pool ${pool} ==`);
    console.log(`price/token    ${price.toFixed(12)} SOL`);
    console.log(`quoteReserve   ${(Number(ps.quoteReserve) / 1e9).toFixed(4)} SOL`);
    console.log(`baseReserve    ${(Number(ps.baseReserve) / 1e6).toLocaleString()} tokens`);
  } else {
    console.log(`\npool ${pool}: not found via SDK`);
  }
}
