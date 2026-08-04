/**
 * floorlaunch indexer: subscribes to program events on an RPC node, stores
 * trades / index pushes / funding ticks per market, serves OHLCV candles,
 * series, and market state over REST, and broadcasts live updates over WS.
 *
 * Feeds the web app's chart and stats panels; later also feeds keeper bots.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import http from "node:http";
import { devLaunch, loadListings, catalogByIdentifier, meFloor, oracleFeedLamports, cardHoldings, launchReadiness, loadCatalog } from "./launch.js";
import { dbcLaunch } from "./dbc.js";
import {
  DynamicBondingCurveClient,
  getPriceFromSqrtPrice,
  TokenDecimal,
  deriveDammV2PoolAddress,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { resolveSecretKey } from "./keypair.js";
import {
  getOrCreateEscrow,
  startVerification,
  checkVerification,
  listEscrows,
  initEscrow,
  startXOAuth,
  handleXCallback,
  type Platform,
} from "./escrow.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const WS_RPC = process.env.RPC_WS_URL ?? RPC.replace("http", "ws").replace("8899", "8900");
// Collector Crypt cards live on mainnet regardless of which cluster the
// commas program runs on, so card-holdings queries use a DAS-capable mainnet
// RPC (falls back to the market RPC when unset).
const DAS_RPC = process.env.DAS_RPC_URL ?? RPC;
const PROGRAM_ID = process.env.PROGRAM_ID ?? "QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM";
const IDL_PATH = process.env.IDL_PATH ?? new URL("../../target/idl/floorlaunch.json", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = new URL("../data", import.meta.url).pathname;
const LISTINGS_PATH = process.env.LISTINGS_PATH ?? new URL("../data/listings.json", import.meta.url).pathname;
const BUNDLED_LISTINGS_PATH =
  process.env.BUNDLED_LISTINGS_PATH ?? new URL("../bundled/listings.json", import.meta.url).pathname;

// Seed/merge bundled listings into the durable volume on boot. The Dockerfile's
// build-time seed is shadowed once the volume mounts, so markets added to the
// bundled snapshot (e.g. a launch done outside the hosted indexer) are merged in
// here for any market key not already present. Never overwrites live entries.
(() => {
  try {
    const bundled = JSON.parse(readFileSync(BUNDLED_LISTINGS_PATH, "utf8"));
    const current = existsSync(LISTINGS_PATH)
      ? JSON.parse(readFileSync(LISTINGS_PATH, "utf8"))
      : {};
    let changed = false;
    for (const [k, v] of Object.entries(bundled)) {
      if (!current[k]) {
        current[k] = v;
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(LISTINGS_PATH, JSON.stringify(current, null, 2));
      console.log(`seeded ${Object.keys(current).length} listing(s) into the volume`);
    }
  } catch (e) {
    console.log("listing seed-merge skipped:", (e as any)?.message ?? e);
  }
})();

const LAMPORTS_PER_SOL = 1e9;
const BASE_UNITS_PER_TOKEN = 1e6;
const TOKENS_PER_UNIT = 1e6;

interface Trade {
  ts: number;            // unix seconds
  side: "buy" | "sell";
  priceSol: number;      // SOL per single token
  solAmount: number;     // SOL
  tokenAmount: number;   // whole tokens
  phase: "curve" | "amm" | "meteora" | "meteora_amm";
  sig: string;
  user: string;
}
interface Tick { ts: number; value: number }

interface MarketStore {
  trades: Trade[];
  index: Tick[];       // SOL per token
  funding: { ts: number; rateBpsPerDay: number; mark: number; index: number }[];
}

// Public devnet RPC rate-limits hard; never let a stray 429 kill the
// process, and cache the heavy /markets scan briefly.
process.on("uncaughtException", (e) => console.error("uncaught:", String(e).slice(0, 200)));
process.on("unhandledRejection", (e) => console.error("unhandled:", String(e).slice(0, 200)));

const stores = new Map<string, MarketStore>();
const seenSigs = new Set<string>();

function store(market: string): MarketStore {
  let s = stores.get(market);
  if (!s) {
    s = { trades: [], index: [], funding: [] };
    stores.set(market, s);
  }
  return s;
}

function persist() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    `${DATA_DIR}/indexer-state.json`,
    JSON.stringify({ markets: [...stores.entries()] })
  );
}
function restore() {
  const f = `${DATA_DIR}/indexer-state.json`;
  if (!existsSync(f)) return;
  try {
    const d = JSON.parse(readFileSync(f, "utf8"));
    for (const [k, v] of d.markets) stores.set(k, v);
    console.log(`restored ${stores.size} market store(s)`);
  } catch {}
}

// ---------- chain ingestion ----------

const connection = new Connection(RPC, { commitment: "confirmed", wsEndpoint: WS_RPC });
// Meteora DBC client for reading external (Meteora) pool state in /markets.
const dbcClient = DynamicBondingCurveClient.create(connection, "confirmed");
const cpClient = new CpAmm(connection);
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const dbcPoolCache = new Map<string, { at: number; markPerToken: number; solReserve: number; tokenReserve: number }>();

// Read a Meteora DBC pool's live price + reserves (10s cache). Returns null if
// the pool can't be read, so the caller falls back to on-chain values.
async function meteoraPool(pool: string) {
  const hit = dbcPoolCache.get(pool);
  if (hit && Date.now() - hit.at < 10_000) return hit;
  try {
    const p: any = await dbcClient.state.getPool(pool);
    const ps = p?.poolState;
    if (!ps) return null;
    const priceSol = Number(
      getPriceFromSqrtPrice(ps.sqrtPrice, TokenDecimal.SIX, TokenDecimal.NINE).toString()
    );
    const info = {
      at: Date.now(),
      markPerToken: priceSol,
      solReserve: Number(ps.quoteReserve) / LAMPORTS_PER_SOL,
      tokenReserve: Number(ps.baseReserve) / BASE_UNITS_PER_TOKEN,
    };
    dbcPoolCache.set(pool, info);
    return info;
  } catch {
    return null;
  }
}

// ---------- Meteora pool swap indexing (external markets) ----------
// External markets trade on Meteora, not this program, so their swaps never
// reach the onLogs subscription. Poll each DBC pool's signatures, derive each
// swap from the base/quote vault balance deltas, and push it into the market's
// trade feed so Activity + candles populate.
const meteoraVaults = new Map<string, { base: string; quote: string }>();
const meteoraLastSig = new Map<string, string>();

async function poolVaults(pool: string) {
  const hit = meteoraVaults.get(pool);
  if (hit) return hit;
  const p: any = await dbcClient.state.getPool(pool);
  const ps = p?.poolState;
  if (!ps) return null;
  const v = { base: ps.baseVault.toBase58(), quote: ps.quoteVault.toBase58() };
  meteoraVaults.set(pool, v);
  return v;
}

// A DBC pool migrates to a DAMM v2 pool within seconds of launch; after that all
// real volume/trades live on the DAMM v2 pool, not the DBC pool. Resolve (and
// cache) that migrated pool + its vaults so the poller can index it too. Returns
// null while the market is still on the bonding curve (not yet migrated).
const dammV2Cache = new Map<string, { pool: string; base: string; quote: string } | null>();
async function dammV2Vaults(dbcPool: string, synthMint?: string) {
  if (dammV2Cache.has(dbcPool)) return dammV2Cache.get(dbcPool) ?? null;
  try {
    if (!synthMint) return null;
    const dbcState: any = await dbcClient.state.getPool(dbcPool);
    if (!dbcState?.poolState?.isMigrated) {
      // Not migrated yet: don't cache a null (re-check next cycle).
      return null;
    }
    const cfg: any = await dbcClient.state.getPoolConfig(dbcState.poolState.config);
    const opt = Number(cfg.migrationFeeOption);
    const dammCfg = (DAMM_V2_MIGRATION_FEE_ADDRESS as any[])[opt];
    const poolPk = deriveDammV2PoolAddress(
      new PublicKey(dammCfg),
      new PublicKey(synthMint),
      new PublicKey(WSOL_MINT)
    );
    const ps: any = await cpClient.fetchPoolState(poolPk);
    const v = {
      pool: poolPk.toBase58(),
      base: ps.tokenAVault.toBase58(),
      quote: ps.tokenBVault.toBase58(),
    };
    dammV2Cache.set(dbcPool, v);
    console.log(`resolved DAMM v2 pool for ${dbcPool.slice(0, 8)} -> ${v.pool}`);
    return v;
  } catch (e) {
    console.log("dammV2 resolve err", dbcPool.slice(0, 8), (e as any)?.message ?? e);
    return null;
  }
}

// Live price + reserves from a migrated market's DAMM v2 pool. The DBC pool's
// sqrtPrice freezes at migration and its reserves drain, so a migrated market
// must read its mark price and liquidity from here, not from meteoraPool().
const dammV2InfoCache = new Map<
  string,
  { at: number; markPerToken: number; solReserve: number; tokenReserve: number }
>();
async function dammV2PoolInfo(v2pool: string) {
  const hit = dammV2InfoCache.get(v2pool);
  if (hit && Date.now() - hit.at < 10_000) return hit;
  try {
    const ps: any = await cpClient.fetchPoolState(new PublicKey(v2pool));
    const markPerToken = Number(
      getPriceFromSqrtPrice(ps.sqrtPrice, TokenDecimal.SIX, TokenDecimal.NINE).toString()
    );
    const [bb, qb] = await Promise.all([
      connection.getTokenAccountBalance(ps.tokenAVault),
      connection.getTokenAccountBalance(ps.tokenBVault),
    ]);
    const info = {
      at: Date.now(),
      markPerToken,
      solReserve: Number(qb.value.amount) / LAMPORTS_PER_SOL,
      tokenReserve: Number(bb.value.amount) / BASE_UNITS_PER_TOKEN,
    };
    dammV2InfoCache.set(v2pool, info);
    return info;
  } catch (e) {
    console.log("dammV2 info err", v2pool.slice(0, 8), (e as any)?.message ?? e);
    return null;
  }
}

// Authoritative 24h volume across ALL of a token's pools (DBC + migrated DAMM v2),
// from DexScreener. We can't cheaply backfill 24h of DAMM v2 swaps into the trade
// store, so the headline 24h number comes from here; the trade store still drives
// the chart + activity from the recent swaps we do poll.
const dexVolCache = new Map<string, { sol: number; at: number }>();
async function dexVolume24hSol(mint: string, solUsd: number): Promise<number | null> {
  if (!mint || !(solUsd > 0)) return null;
  const hit = dexVolCache.get(mint);
  if (hit && Date.now() - hit.at < 120_000) return hit.sol;
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const j: any = await r.json();
    const usd = (j?.pairs ?? []).reduce(
      (s: number, p: any) => s + (Number(p?.volume?.h24) || 0),
      0
    );
    const sol = usd / solUsd;
    dexVolCache.set(mint, { sol, at: Date.now() });
    return sol;
  } catch {
    return null;
  }
}

// Poll one Meteora pool (DBC bonding curve OR migrated DAMM v2) for swaps and
// merge them into the market's trade store. `phase` tags which pool each trade
// came from so a first-run rebuild only drops that pool's trades, not the other's
// (a market has both a DBC-phase history and a DAMM v2 post-migration history).
async function pollPoolSwaps(
  market: string,
  poolAddr: string,
  vaults: { base: string; quote: string },
  phase: "meteora" | "meteora_amm",
  firstLimit: number,
) {
  const poolPk = new PublicKey(poolAddr);
  const first = !meteoraLastSig.has(poolAddr);
  const sigs = await connection.getSignaturesForAddress(poolPk, { limit: first ? firstLimit : 25 });
  if (first) {
    const s = store(market);
    s.trades = s.trades.filter((t) => t.phase !== phase);
  }
  const last = meteoraLastSig.get(poolAddr);
  const fresh: typeof sigs = [];
  for (const s of sigs) {
    if (!first && s.signature === last) break;
    if (!s.err) fresh.push(s);
  }
  fresh.reverse(); // oldest first
  let added = 0;
  for (const s of fresh) {
    if (!first && seenSigs.has(s.signature)) continue;
    seenSigs.add(s.signature);
    try {
      const tx = await connection.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      // Prefer the parsed tx blockTime (reliably present) over the signature
      // list's blockTime (often null), so trades land in the right candle.
      const ts = tx?.blockTime ?? s.blockTime ?? Math.floor(Date.now() / 1000);
      const trade = parseMeteoraSwap(tx, vaults.base, vaults.quote, ts, s.signature);
      if (trade) {
        trade.phase = phase;
        store(market).trades.push(trade);
        broadcast({ type: "trade", market, trade });
        added++;
      }
    } catch (e) {
      console.log("pool tx parse error", s.signature, (e as any)?.message ?? e);
    }
  }
  if (first) store(market).trades.sort((a, b) => a.ts - b.ts);
  if (first || added) {
    console.log(`pool poll ${market} ${phase}: first=${first} sigs=${sigs.length} fresh=${fresh.length} added=${added}`);
  }
  if (sigs[0]) meteoraLastSig.set(poolAddr, sigs[0].signature);
}

// Re-entrancy guard: the first-run backfill (hundreds of getParsedTransaction
// calls) can take longer than the poll interval, so without this the next tick
// would start a second concurrent backfill and both would re-add the same swaps.
let meteoraPolling = false;
async function pollMeteoraTrades() {
  if (meteoraPolling) return;
  meteoraPolling = true;
  try {
    const listings = loadListings();
    for (const [market, meta] of Object.entries(listings)) {
      const m: any = meta;
      if (m.venue !== "meteora" || !m.dbcPool) continue;
      try {
        // 1) DBC bonding-curve pool: the pre-migration launch trades.
        const v = await poolVaults(m.dbcPool);
        if (v) await pollPoolSwaps(market, m.dbcPool, v, "meteora", 200);
        // 2) Migrated DAMM v2 pool: where all the real post-migration volume lives.
        const v2 = await dammV2Vaults(m.dbcPool, m.synthMint);
        if (v2) await pollPoolSwaps(market, v2.pool, { base: v2.base, quote: v2.quote }, "meteora_amm", 400);
      } catch (e) {
        console.log("meteora poll error", m.dbcPool, (e as any)?.message ?? e);
      }
    }
  } finally {
    meteoraPolling = false;
  }
}

function parseMeteoraSwap(tx: any, baseVault: string, quoteVault: string, ts: number, sig: string): Trade | null {
  if (!tx?.meta) return null;
  const keys = tx.transaction.message.accountKeys.map((k: any) =>
    (k.pubkey ?? k).toString()
  );
  const raw = (arr: any[], vault: string): number | null => {
    const e = (arr ?? []).find((b: any) => keys[b.accountIndex] === vault);
    return e ? Number(e.uiTokenAmount.amount) : null;
  };
  const bBefore = raw(tx.meta.preTokenBalances, baseVault);
  const bAfter = raw(tx.meta.postTokenBalances, baseVault);
  const qBefore = raw(tx.meta.preTokenBalances, quoteVault);
  const qAfter = raw(tx.meta.postTokenBalances, quoteVault);
  if (bBefore == null || bAfter == null || qBefore == null || qAfter == null) return null;
  const dBase = bAfter - bBefore; // base units (6 dec)
  const dQuote = qAfter - qBefore; // lamports
  if (dBase === 0 || dQuote === 0) return null;
  const tokens = Math.abs(dBase) / BASE_UNITS_PER_TOKEN;
  const sol = Math.abs(dQuote) / LAMPORTS_PER_SOL;
  return {
    ts,
    side: dBase < 0 ? "buy" : "sell", // base left the pool => user bought
    priceSol: tokens > 0 ? sol / tokens : 0,
    solAmount: sol,
    tokenAmount: tokens,
    phase: "meteora",
    sig,
    user: keys[0] ?? "",
  };
}

// ---------- Helius webhook: real-time Meteora swap ingestion ----------
// Push instead of poll: Helius POSTs /helius/webhook on any tx touching a
// watched pool, so new/small markets index instantly. We fetch + parse the swap
// and push it into the trade feed, deduped against the poller by signature. The
// webhook is (re)synced to watch every meteora pool on boot + on a timer.
// Requires HELIUS_API_KEY; the poller remains as a backfill/fallback.
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;
// Remembered across syncs so we UPDATE one webhook instead of creating a new one
// every interval. Seeded from env, then discovered/created on first sync.
let heliusWebhookId: string | undefined = process.env.HELIUS_WEBHOOK_ID;

async function handleHeliusTx(payload: any): Promise<void> {
  const sig: string | undefined =
    payload?.signature ?? payload?.transaction?.signatures?.[0];
  if (!sig || seenSigs.has(sig)) return;
  const meteora = Object.entries(loadListings()).filter(
    ([, m]) => (m as any).venue === "meteora" && (m as any).dbcPool
  );
  if (!meteora.length) return;
  const tx = await connection.getParsedTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) return;
  const ts = tx.blockTime ?? Math.floor(Date.now() / 1000);
  for (const [market, m] of meteora) {
    const v = await poolVaults((m as any).dbcPool);
    if (!v) continue;
    const trade = parseMeteoraSwap(tx, v.base, v.quote, ts, sig);
    if (trade) {
      seenSigs.add(sig);
      store(market).trades.push(trade);
      broadcast({ type: "trade", market, trade });
      break;
    }
  }
}

// Register (or update) the Helius webhook to watch every meteora pool address.
async function syncHeliusWebhook(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return;
  const pools = Object.values(loadListings())
    .filter((m: any) => m.venue === "meteora" && m.dbcPool)
    .map((m: any) => m.dbcPool as string);
  if (!pools.length) return;
  const webhookURL =
    process.env.HELIUS_WEBHOOK_URL ??
    `${process.env.PUBLIC_BASE_URL ?? "https://commas-indexer.fly.dev"}/helius/webhook`;
  const body: Record<string, unknown> = {
    webhookURL,
    transactionTypes: ["ANY"],
    accountAddresses: pools,
    webhookType: "raw",
  };
  if (HELIUS_WEBHOOK_SECRET) body.authHeader = `Bearer ${HELIUS_WEBHOOK_SECRET}`;
  try {
    // Discover existing webhooks so restarts (and prior duplicate-creating runs)
    // converge on a single webhook for our URL instead of piling up new ones.
    if (!heliusWebhookId) {
      const listRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`);
      const list: any[] = await listRes.json().catch(() => []);
      const mine = Array.isArray(list)
        ? list.filter((w) => w?.webhookURL === webhookURL)
        : [];
      if (mine.length) {
        heliusWebhookId = mine[0].webhookID;
        // Delete any duplicates pointing at the same URL (from earlier runs).
        for (const dup of mine.slice(1)) {
          await fetch(`https://api.helius.xyz/v0/webhooks/${dup.webhookID}?api-key=${apiKey}`, {
            method: "DELETE",
          }).catch(() => {});
          console.log(`deleted duplicate helius webhook ${dup.webhookID}`);
        }
      }
    }
    const url = heliusWebhookId
      ? `https://api.helius.xyz/v0/webhooks/${heliusWebhookId}?api-key=${apiKey}`
      : `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`;
    const r = await fetch(url, {
      method: heliusWebhookId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (j?.webhookID) heliusWebhookId = j.webhookID;
    console.log(`synced helius webhook ${heliusWebhookId ?? "?"} -> ${pools.length} pool(s)`);
  } catch (e) {
    console.log("helius webhook sync failed:", (e as any)?.message ?? e);
  }
}

const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
idl.address = PROGRAM_ID;
const coder = new anchor.BorshCoder(idl);
const eventParser = new anchor.EventParser(new PublicKey(PROGRAM_ID), coder);
const program = new anchor.Program(
  idl,
  new anchor.AnchorProvider(connection, {} as any, { commitment: "confirmed" })
);

const n = (x: any) => Number(x?.toString?.() ?? x);
const fld = (o: any, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined) return o[k]; };
const perTokenSol = (solLamports: number, tokenBase: number) =>
  solLamports / LAMPORTS_PER_SOL / (tokenBase / BASE_UNITS_PER_TOKEN);

async function handleEvent(rawName: string, data: any, sig: string, ts: number) {
  const name = rawName.charAt(0).toLowerCase() + rawName.slice(1);
  if (!["curveTraded", "ammTraded", "indexPushed", "fundingAccrued", "shortChanged", "graduated", "breakerTripped", "liquidated"].includes(name)) {
    console.log("unhandled event:", rawName);
  }
  if (name === "curveTraded" || name === "ammTraded") {
    const market = data.market.toBase58();
    // Price = the market's SPOT after this trade, not the fill's average:
    // a single buy that walks the whole curve executes at the mid-span
    // average, but the market now trades at the post-fill spot.
    let priceSol = perTokenSol(n(fld(data, "solAmount", "sol_amount")), n(fld(data, "tokenAmount", "token_amount")));
    try {
      const acc: any = await (program.account as any).market.fetch(new PublicKey(market));
      const spot =
        "live" in acc.status
          ? Number(acc.ammSolReserve) / LAMPORTS_PER_SOL / (Number(acc.ammTokenReserve) / BASE_UNITS_PER_TOKEN)
          : Number(acc.curveVirtualSol) / LAMPORTS_PER_SOL / (Number(acc.curveVirtualTokens) / BASE_UNITS_PER_TOKEN);
      if (spot > 0) priceSol = spot;
    } catch {}
    const t: Trade = {
      ts,
      side: fld(data, "isBuy", "is_buy") ? "buy" : "sell",
      priceSol,
      solAmount: n(fld(data, "solAmount", "sol_amount")) / LAMPORTS_PER_SOL,
      tokenAmount: n(fld(data, "tokenAmount", "token_amount")) / BASE_UNITS_PER_TOKEN,
      phase: name === "curveTraded" ? "curve" : "amm",
      sig,
      user: data.user.toBase58(),
    };
    store(market).trades.push(t);
    broadcast({ type: "trade", market, trade: t });
    if (t.phase === "curve") setTimeout(autoGraduate, 1_500);
  } else if (name === "indexPushed") {
    const market = data.market.toBase58();
    const tick = { ts, value: n(data.twap) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT };
    store(market).index.push(tick);
    broadcast({ type: "index", market, tick });
  } else if (name === "fundingAccrued") {
    const market = data.market.toBase58();
    const f = {
      ts,
      rateBpsPerDay: n(fld(data, "rateBpsPerDay", "rate_bps_per_day")),
      mark: n(data.mark) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT,
      index: n(data.index) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT,
    };
    store(market).funding.push(f);
    broadcast({ type: "funding", market, tick: f });
  }
}

function subscribe() {
  connection.onLogs(new PublicKey(PROGRAM_ID), (logs) => {
    if (logs.err || seenSigs.has(logs.signature)) return;
    seenSigs.add(logs.signature);
    const ts = Math.floor(Date.now() / 1000);
    (async () => {
      try {
        for (const ev of eventParser.parseLogs(logs.logs)) {
          await handleEvent(ev.name, ev.data, logs.signature, ts);
        }
      } catch {}
    })();
  }, "confirmed");
  console.log(`subscribed to program logs for ${PROGRAM_ID}`);
}

// ---------- candles ----------

function candles(market: string, tfSecs: number, limit: number) {
  const trades = store(market).trades;
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number; n: number }>();
  for (const t of trades) {
    const b = Math.floor(t.ts / tfSecs) * tfSecs;
    const c = buckets.get(b);
    if (!c) buckets.set(b, { o: t.priceSol, h: t.priceSol, l: t.priceSol, c: t.priceSol, v: t.solAmount, n: 1 });
    else {
      c.h = Math.max(c.h, t.priceSol);
      c.l = Math.min(c.l, t.priceSol);
      c.c = t.priceSol;
      c.v += t.solAmount;
      c.n += 1;
    }
  }
  const out = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, c]) => ({ time, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v, trades: c.n }));
  return out.slice(-limit);
}

// ---------- REST + WS ----------

const app = express();
// Behind Fly's proxy: makes req.protocol reflect x-forwarded-proto (https),
// so upload URLs are https and don't 301-redirect.
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Uploaded token images (served for the app + listing metadata).
const UPLOADS_DIR = new URL("../data/uploads", import.meta.url).pathname;
mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

app.post("/upload", (req, res) => {
  try {
    const { dataUrl } = req.body as { dataUrl: string };
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl ?? "");
    if (!m) throw new Error("expected a base64 image data URL");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 6_000_000) throw new Error("image too large (6MB max)");
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    writeFileSync(`${UPLOADS_DIR}/${name}`, buf);
    res.json({ url: `${req.protocol}://${req.get("host")}/uploads/${name}` });
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

// Cached SOL/USD for display-layer conversion (pools stay SOL-paired).
let solUsdCache = { value: 0, at: 0 };
async function getSolUsd(): Promise<number> {
  if (Date.now() - solUsdCache.at < 120_000 && solUsdCache.value > 0) return solUsdCache.value;
  try {
    const r = await fetch(
      "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d&parsed=true"
    );
    const b: any = await r.json();
    const p = b.parsed[0].price;
    solUsdCache = { value: Number(p.price) * Math.pow(10, p.expo), at: Date.now() };
  } catch {}
  return solUsdCache.value;
}
getSolUsd();

app.get("/listings", (_req, res) => res.json(loadListings()));

// Token metadata JSON for a launched market's mint (Metaplex off-chain URI).
// Meteora writes this URL into the DBC-created mint's on-chain metadata, so
// Solscan and terminals render the collectible as the token's identity: the
// card/collection name + image, plus an "Underlying" / "Collectible ID"
// attribute set. Keyed by market PDA to match the listing store.
app.get("/token-metadata/:id.json", (req, res) => {
  const listings = loadListings();
  // The mint's immutable metadata URI is keyed by MINT address; listings are
  // keyed by market PDA. Resolve by either (mint via synthMint, or market key).
  const id = req.params.id;
  const meta: any =
    listings[id] ?? Object.values(listings).find((l: any) => l.synthMint === id);
  if (!meta) return res.status(404).json({ error: "unknown token" });
  const u: any = catalogByIdentifier(meta.identifier) ?? {};
  // Catalog images are relative (/underlyings/x.png) and served by the frontend,
  // not this indexer - so for the token metadata JSON (fetched by Solscan) we
  // resolve them to a public absolute URL (the repo's raw host by default).
  const IMG_BASE =
    process.env.UNDERLYINGS_IMAGE_BASE ??
    "https://raw.githubusercontent.com/cocainebit/floorlaunch/main/app/public";
  const image =
    meta.image ??
    (u.image ? (u.image.startsWith("http") ? u.image : `${IMG_BASE}${u.image}`) : undefined);
  const underlyingName = u.name ?? meta.name;
  const attributes = [
    { trait_type: "Underlying", value: underlyingName },
    u.collectionId ? { trait_type: "Collectible ID", value: u.collectionId } : null,
    u.grade ? { trait_type: "Grade", value: u.grade } : null,
    u.category ? { trait_type: "Category", value: u.category } : null,
    { trait_type: "Venue", value: meta.venue === "meteora" ? "Meteora DBC" : "Commas" },
  ].filter(Boolean);
  res.json({
    name: meta.name,
    symbol: meta.ticker,
    description: `${meta.name} is a commas market whose price tracks the ${underlyingName} collectible. Underlying: ${underlyingName}.`,
    image,
    external_url: meta.links?.website ?? "https://commas.art",
    attributes,
  });
});

// Which catalog underlyings does a wallet hold the backing collectible for?
// Cards resolve against Collector Crypt's Core collection on-chain.
app.get("/holdings/:owner", async (req, res) => {
  try {
    res.json(await cardHoldings(DAS_RPC, req.params.owner));
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// Full holder list for a mint, done server-side so clients need no Helius key.
// Enumerates every token account via DAS getTokenAccounts (getTokenLargestAccounts
// caps at 20 and DAS is not on the public RPC), aggregates by owner, and keeps
// only real wallets (pool/program vaults are off-curve PDAs).
app.get("/holders/:mint", async (req, res) => {
  try {
    const mint = req.params.mint;
    const balances = new Map<string, bigint>();
    let cursor: string | undefined;
    for (let page = 0; page < 25; page++) {
      const r = await fetch(DAS_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "holders",
          method: "getTokenAccounts",
          params: { mint, limit: 1000, ...(cursor ? { cursor } : {}) },
        }),
      });
      const j: any = await r.json();
      const accounts: any[] = j?.result?.token_accounts ?? [];
      if (!accounts.length) break;
      for (const a of accounts) {
        const owner = String(a.owner ?? "");
        let amount = 0n;
        try { amount = BigInt(a.amount ?? 0); } catch { amount = 0n; }
        if (!owner || amount === 0n) continue;
        let onCurve = false;
        try { onCurve = PublicKey.isOnCurve(new PublicKey(owner).toBytes()); } catch { onCurve = false; }
        if (!onCurve) continue;
        balances.set(owner, (balances.get(owner) ?? 0n) + amount);
      }
      cursor = j?.result?.cursor;
      if (!cursor) break;
    }
    const out = Array.from(balances, ([address, balance]) => ({ address, balance: balance.toString() }))
      .sort((a, b) => (BigInt(a.balance) === BigInt(b.balance) ? 0 : BigInt(a.balance) > BigInt(b.balance) ? -1 : 1));
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.get("/escrows", (_req, res) => res.json(listEscrows()));

app.post("/escrow", (req, res) => {
  try {
    const { platform, handle } = req.body as { platform: Platform; handle: string };
    if (!["x", "youtube", "elitefourum"].includes(platform) || !handle) {
      throw new Error("platform must be x|youtube|elitefourum and handle required");
    }
    res.json(getOrCreateEscrow(platform, handle));
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

// X (Twitter) OAuth: /start redirects to X; /callback confirms the @username,
// releases the escrow, and bounces back to the app.
app.get("/verify-x/start", (req, res) => {
  try {
    const url = startXOAuth(
      String(req.query.handle ?? ""),
      String(req.query.wallet ?? ""),
      req.query.returnTo ? String(req.query.returnTo) : undefined
    );
    res.redirect(url);
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

app.get("/verify-x/callback", async (req, res) => {
  const r = await handleXCallback(
    RPC,
    String(req.query.code ?? ""),
    String(req.query.state ?? "")
  );
  const sep = r.returnTo.includes("?") ? "&" : "?";
  const q = r.ok
    ? `x_verified=${encodeURIComponent(r.handle ?? "")}`
    : `x_error=${encodeURIComponent(r.error ?? "failed")}`;
  res.redirect(`${r.returnTo}${sep}${q}`);
});

app.post("/escrow/:platform/:handle/verify-start", (req, res) => {
  try {
    res.json(
      startVerification(req.params.platform as Platform, req.params.handle, req.body.wallet)
    );
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

app.post("/escrow/:platform/:handle/verify-check", async (req, res) => {
  try {
    res.json(
      await checkVerification(RPC, req.params.platform as Platform, req.params.handle, {
        adminOverride: req.body?.adminOverride === true && (RPC.includes("127.0.0.1") || RPC.includes("localhost")),
      })
    );
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

// Pre-fee readiness: the UI calls this before charging the launch fee, so a
// launch that would fail never takes money.
app.get("/launch/readiness", async (req, res) => {
  try {
    const id = typeof req.query.identifier === "string" ? req.query.identifier : undefined;
    await launchReadiness(RPC, id);
    res.json({ ready: true });
  } catch (e: any) {
    res.status(503).json({ ready: false, error: String(e?.message ?? e).slice(0, 200) });
  }
});

app.post("/dev/launch", async (req, res) => {
  try {
    // Venue switch: Meteora DBC when explicitly requested (body.venue) or when
    // DBC_LAUNCH=1 is set. Gated (not the silent default) until the DBC path
    // has had a live mainnet validation pass. Internal curve otherwise.
    const useDbc = req.body?.venue === "meteora" || process.env.DBC_LAUNCH === "1";
    const r = useDbc
      ? await dbcLaunch(RPC, PROGRAM_ID, structuredClone(idl), req.body)
      : await devLaunch(RPC, PROGRAM_ID, structuredClone(idl), req.body);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

// Helius webhook receiver: real-time Meteora swaps -> trade feed. Acks fast and
// processes async so Helius does not retry on a slow parse. Optional bearer auth.
app.post("/helius/webhook", (req, res) => {
  if (
    HELIUS_WEBHOOK_SECRET &&
    req.headers["authorization"] !== `Bearer ${HELIUS_WEBHOOK_SECRET}`
  ) {
    return res.status(401).end();
  }
  const txs = Array.isArray(req.body) ? req.body : req.body ? [req.body] : [];
  res.status(200).json({ ok: true });
  (async () => {
    for (const tx of txs) {
      try {
        await handleHeliusTx(tx);
      } catch {}
    }
  })().catch(() => {});
});

let marketsCache: { at: number; body: any } | null = null;
app.get("/markets", async (_req, res) => {
  try {
    if (marketsCache && Date.now() - marketsCache.at < 4_000) {
      res.json(marketsCache.body);
      return;
    }
    const accounts = await (program.account as any).market.all();
    const solUsd = await getSolUsd();
    const listings = loadListings();
    const body = await Promise.all(
      accounts
        // Only listed markets: an on-chain market without listing metadata
        // (e.g. a crashed launch) would render as an unknown ghost.
        .filter((a: any) => listings[a.publicKey.toBase58()])
        .map(async (a: any) => {
          // The on-chain index is launch-scaled (0.625 SOL per unit at
          // launch); recover the collectible's real price from the listing.
          const meta: any = listings[a.publicKey.toBase58()];
          const scaledUnitSol = Number(a.account.indexTwap) / LAMPORTS_PER_SOL;
          const cardIndexSol =
            meta?.indexAtLaunchLamports > 0
              ? (scaledUnitSol / 0.625) * (meta.indexAtLaunchLamports / LAMPORTS_PER_SOL)
              : scaledUnitSol;
          const row: any = {
            market: a.publicKey.toBase58(),
            solUsd,
            cardIndexSol,
            unitsPerItem: (meta?.unitsPerItemMicro ?? 1_000_000) / 1_000_000,
            collection: a.account.collection.toBase58(),
            synthMint: a.account.synthMint.toBase58(),
            status: Object.keys(a.account.status)[0],
            venue: Object.keys(a.account.venue)[0],
            frozen: a.account.frozen,
            indexPerToken: Number(a.account.indexTwap) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT,
            markPerToken: Number(a.account.markEma) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT,
            indexLastTs: Number(a.account.indexLastTs),
            feedAgeSec: (() => {
              const ticks = store(a.publicKey.toBase58()).index;
              return ticks.length
                ? Math.floor(Date.now() / 1000) - ticks[ticks.length - 1].ts
                : null;
            })(),
            ammSolReserve: Number(a.account.ammSolReserve) / LAMPORTS_PER_SOL,
            ammTokenReserve: Number(a.account.ammTokenReserve) / BASE_UNITS_PER_TOKEN,
            insuranceSol: Number(a.account.insuranceLamports) / LAMPORTS_PER_SOL,
            totalCollateralSol: Number(a.account.totalCollateral) / LAMPORTS_PER_SOL,
            fundingIndex: a.account.fundingIndex.toString(),
            curveSolRaised: Number(a.account.curveSolRaised) / LAMPORTS_PER_SOL,
            curveVirtualSol: Number(a.account.curveVirtualSol) / LAMPORTS_PER_SOL,
            curveVirtualTokens: Number(a.account.curveVirtualTokens) / BASE_UNITS_PER_TOKEN,
            graduationTargetSol: Number(a.account.params.graduationTargetSol) / LAMPORTS_PER_SOL,
            maxOpenInterest: Number(a.account.params.maxOpenInterest) / BASE_UNITS_PER_TOKEN,
            itemsDeposited: a.account.itemsDeposited,
            // Real 24h SOL volume from the full trade store (all indexed trades,
            // incl. Meteora swaps), not just the slice the client fetches.
            volume24hSol: (() => {
              const cutoff = Math.floor(Date.now() / 1000) - 86_400;
              return store(a.publicKey.toBase58()).trades
                .filter((t) => t.ts >= cutoff)
                .reduce((s, t) => s + t.solAmount, 0);
            })(),
          };
          // External (Meteora DBC) markets: override the traded price + liquidity
          // with the live pool so the explorer reflects the real Meteora venue.
          if (meta?.venue === "meteora" && meta.dbcPool) {
            row.venue = "meteora";
            row.dbcPool = meta.dbcPool;
            // Migrated markets: read live price + reserves from the DAMM v2 pool.
            // The DBC pool freezes at the migration price and drains afterward, so
            // reading it gave a stale mark, market cap, and liquidity.
            const v2 = await dammV2Vaults(meta.dbcPool, (meta as any).synthMint);
            const pool = v2
              ? await dammV2PoolInfo(v2.pool)
              : await meteoraPool(meta.dbcPool);
            if (pool) {
              row.markPerToken = pool.markPerToken;
              row.ammSolReserve = pool.solReserve;
              row.ammTokenReserve = pool.tokenReserve;
            }
            // After migration the real 24h volume lives on the DAMM v2 pool, which
            // the trade store only partially backfills. Prefer DexScreener's true
            // cross-pool 24h volume when it's higher than what we've indexed.
            const dexVol = await dexVolume24hSol((meta as any).synthMint, row.solUsd);
            if (dexVol != null && dexVol > row.volume24hSol) row.volume24hSol = dexVol;
          }
          return row;
        })
    );
    marketsCache = { at: Date.now(), body };
    res.json(body);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregator: every catalog collectible with all its price sources, the
// spread between them, and the markets launched against it. Live Magic
// Eden floors are fetched with a 5 minute cache.
app.get("/aggregator", async (_req, res) => {
  try {
    const catalog: any[] = loadCatalog();
    const listings = loadListings();
    const accounts = await (program.account as any).market.all();
    const solUsd = await getSolUsd();
    const byId = new Map<string, any[]>();
    for (const [market, meta] of Object.entries(listings)) {
      const a = accounts.find((x: any) => x.publicKey.toBase58() === market);
      if (!a) continue;
      const scaled = Number(a.account.indexTwap) / LAMPORTS_PER_SOL;
      const atLaunch = (meta as any).indexAtLaunchLamports;
      const arr = byId.get((meta as any).identifier) ?? [];
      arr.push({
        market,
        ticker: (meta as any).ticker,
        status: Object.keys(a.account.status)[0],
        priceSol:
          Number(a.account.markEma) / LAMPORTS_PER_SOL / TOKENS_PER_UNIT,
        premiumPct:
          Number(a.account.markEma) > 0 && Number(a.account.indexTwap) > 0
            ? (Number(a.account.markEma) / Number(a.account.indexTwap) - 1) * 100
            : null,
        onchainIndexSol:
          atLaunch > 0 ? (scaled / 0.625) * (atLaunch / LAMPORTS_PER_SOL) : null,
      });
      byId.set((meta as any).identifier, arr);
    }
    const rows = await Promise.all(
      catalog.map(async (u: any) => {
        const snapshotSol =
          u.kind === "nft"
            ? u.snapshot?.floorSol ?? null
            : (u.usdPrice ?? u.snapshot?.ccFloorUsd) / solUsd;
        const liveSol =
          u.kind === "nft" && u.identifier?.startsWith("magiceden:")
            ? await meFloor(u.identifier.split(":")[1])
            : null;
        const markets = byId.get(u.identifier) ?? [];
        const feedLamports = await oracleFeedLamports(u, solUsd);
        const chainSol =
          markets.find((m) => m.onchainIndexSol)?.onchainIndexSol ??
          (feedLamports ? feedLamports / LAMPORTS_PER_SOL : null);
        const sources = [snapshotSol, liveSol, chainSol].filter(
          (v): v is number => v != null && v > 0
        );
        const spreadPct =
          sources.length >= 2
            ? ((Math.max(...sources) - Math.min(...sources)) /
                ((Math.max(...sources) + Math.min(...sources)) / 2)) *
              100
            : null;
        return {
          identifier: u.identifier,
          name: u.name,
          category: u.category,
          kind: u.kind,
          image: u.image ?? null,
          snapshotSol,
          liveSol,
          chainSol,
          spreadPct,
          listed: u.snapshot?.listed ?? null,
          weeklyVolSol: u.snapshot?.weeklyVolSol ?? null,
          solUsd,
          markets,
        };
      })
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

app.get("/candles/:market", (req, res) => {
  const tf = Number(req.query.tf ?? 60);
  const limit = Number(req.query.limit ?? 500);
  res.json(candles(req.params.market, tf, limit));
});

app.get("/index/:market", (req, res) => {
  const limit = Number(req.query.limit ?? 2000);
  res.json(store(req.params.market).index.slice(-limit));
});

app.get("/trades/:market", (req, res) => {
  const limit = Number(req.query.limit ?? 60);
  res.json(store(req.params.market).trades.slice(-limit).reverse());
});

app.get("/funding/:market", (req, res) => {
  const limit = Number(req.query.limit ?? 500);
  res.json(store(req.params.market).funding.slice(-limit));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
function broadcast(msg: any) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

initEscrow(idl);

// Oracle refresher: keeps every launched market's feed fresh by re-pushing
// the allowlist-derived index every 5 minutes (localnet stand-in for the
// production relayer following the listings file).
async function refreshOracles() {
  try {
    const { Keypair } = await import("@solana/web3.js");
    const anchorMod = await import("@coral-xyz/anchor");
    const { homedir } = await import("node:os");
    const secret = resolveSecretKey({
      keyEnv: "ORACLE_KEYPAIR",
      pathEnv: "ORACLE_KEY_PATH",
      defaultPath: `${homedir()}/floorlaunch/relayer/keys/oracle-sim.json`,
    });
    if (!secret) return; // no oracle key available: skip the refresh
    const oracle = Keypair.fromSecretKey(secret);
    const provider = new anchorMod.AnchorProvider(connection, new anchorMod.Wallet(oracle), {
      commitment: "confirmed",
    });
    const prog = new anchorMod.Program(structuredClone(idl), provider);
    // Localnet self-funding: the oracle pays its own push fees.
    if (RPC.includes("127.0.0.1") || RPC.includes("localhost") || RPC.includes("devnet")) {
      const bal = await connection.getBalance(oracle.publicKey);
      if (bal < 1e8) {
        try {
          const amount = RPC.includes("devnet") ? 2e9 : 10e9;
          const sig = await connection.requestAirdrop(oracle.publicKey, amount);
          await connection.confirmTransaction(sig);
        } catch {}
      }
    }
    const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], new PublicKey(PROGRAM_ID));
    const listings = loadListings();
    const solUsd = await getSolUsd();
    for (const [market, meta] of Object.entries(listings)) {
      try {
        const u = catalogByIdentifier((meta as any).identifier);
        if (!u) continue;
        const lamports = (await oracleFeedLamports(u, solUsd)) ?? 0;
        if (!(lamports > 0)) continue;
        // The on-chain index is launch-scaled: 0.625 SOL per unit at
        // launch, moving with the collectible from there.
        const atLaunch = (meta as any).indexAtLaunchLamports;
        const scaled = atLaunch > 0 ? Math.round((lamports / atLaunch) * 625_000_000) : lamports;
        const BN = (await import("bn.js")).default;
        await prog.methods
          .pushIndex(new BN(scaled))
          .accountsPartial({
            global: globalPda,
            oracleAuthority: oracle.publicKey,
            market: new PublicKey(market),
          })
          .signers([oracle])
          .rpc();
        // External (Meteora) markets: also push the live pool price as the mark
        // (the traded price the premium/funding math compares to the index).
        // markPerToken is SOL/token; the on-chain mark is lamports per 1M-token
        // unit, so scale by 1e15 (1e6 tokens/unit * 1e9 lamports/SOL).
        if ((meta as any).venue === "meteora" && (meta as any).dbcPool) {
          const pool = await meteoraPool((meta as any).dbcPool);
          if (pool && pool.markPerToken > 0) {
            await prog.methods
              .pushMark(new BN(Math.round(pool.markPerToken * 1e15)))
              .accountsPartial({
                global: globalPda,
                oracleAuthority: oracle.publicKey,
                market: new PublicKey(market),
              })
              .signers([oracle])
              .rpc();
          }
        }
      } catch {}
    }
  } catch {}
}
setInterval(refreshOracles, 300_000);
setTimeout(refreshOracles, 15_000);
// Meteora pool swap indexing for external markets (Activity + candles). The
// Helius webhook is the real-time path; this poller backfills history and covers
// anything the webhook misses. Both dedupe by signature.
setInterval(pollMeteoraTrades, 15_000);
setTimeout(pollMeteoraTrades, 8_000);
// Keep the Helius webhook subscribed to every meteora pool (no-op without a key).
setInterval(syncHeliusWebhook, 300_000);
setTimeout(syncHeliusWebhook, 12_000);

// Fee-split keeper: trading fees (0.70%) accrue per market on chain;
// sweep any balance above 0.02 SOL as two withdraw_fees calls, half to
// the protocol treasury and half to the wallet that launched the market.
import { FEE_TREASURY } from "./launch.js";
async function sweepFees() {
  try {
    const { Keypair } = await import("@solana/web3.js");
    const anchorMod = await import("@coral-xyz/anchor");
    const { homedir } = await import("node:os");
    const BN = (await import("bn.js")).default;
    const secret = resolveSecretKey({
      keyEnv: "ADMIN_KEYPAIR",
      pathEnv: "ADMIN_KEY_PATH",
      defaultPath: `${homedir()}/.config/solana/id.json`,
    });
    if (!secret) return; // no admin key available: skip the fee sweep
    const admin = Keypair.fromSecretKey(secret);
    const provider = new anchorMod.AnchorProvider(connection, new anchorMod.Wallet(admin), {
      commitment: "confirmed",
    });
    const prog = new anchorMod.Program(structuredClone(idl), provider);
    const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], new PublicKey(PROGRAM_ID));
    const listings = loadListings();
    for (const [market, meta] of Object.entries(listings)) {
      try {
        const marketPk = new PublicKey(market);
        const m: any = await (prog.account as any).market.fetch(marketPk);
        const fees = Number(m.feeLamports);
        if (fees < 20_000_000) continue;
        const half = Math.floor(fees / 2);
        const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), marketPk.toBuffer()], new PublicKey(PROGRAM_ID));
        const creator = new PublicKey((meta as any).launchedBy);
        for (const [recipient, amount] of [
          [new PublicKey(FEE_TREASURY), half],
          [creator, fees - half],
        ] as const) {
          await prog.methods
            .withdrawFees(new BN(amount))
            .accountsPartial({ global: globalPda, admin: admin.publicKey, market: marketPk, solVault: vault, recipient })
            .rpc();
        }
        console.log(`fees swept for ${market}: ${(fees / 1e9).toFixed(4)} SOL split treasury/creator`);
      } catch (e: any) {
        console.log(`fee sweep ${market}: ${String(e.message ?? e).slice(0, 80)}`);
      }
    }
  } catch {}
}
setInterval(sweepFees, 300_000);
setTimeout(sweepFees, 30_000);

// Auto-migration: when a curve reaches its graduation target the market
// migrates to the AMM automatically (graduate is permissionless; the
// indexer pays the fee). Swept every 10s and nudged by trade events.
let graduating = new Set<string>();
async function autoGraduate() {
  try {
    const { Keypair } = await import("@solana/web3.js");
    const anchorMod = await import("@coral-xyz/anchor");
    const { homedir } = await import("node:os");
    const secret = resolveSecretKey({
      keyEnv: "ADMIN_KEYPAIR",
      pathEnv: "ADMIN_KEY_PATH",
      defaultPath: `${homedir()}/.config/solana/id.json`,
    });
    if (!secret) return; // no admin key available: skip auto-migration
    const admin = Keypair.fromSecretKey(secret);
    const provider = new anchorMod.AnchorProvider(connection, new anchorMod.Wallet(admin), {
      commitment: "confirmed",
    });
    const prog = new anchorMod.Program(structuredClone(idl), provider);
    const accounts = await (prog.account as any).market.all();
    for (const a of accounts) {
      const m = a.account;
      const key = a.publicKey.toBase58();
      if (!("bootstrap" in m.status) || graduating.has(key)) continue;
      if (Number(m.curveSolRaised) < Number(m.params.graduationTargetSol)) continue;
      graduating.add(key);
      try {
        const pid = new PublicKey(PROGRAM_ID);
        const [mint] = PublicKey.findProgramAddressSync([Buffer.from("mint"), a.publicKey.toBuffer()], pid);
        const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), a.publicKey.toBuffer()], pid);
        const sig = await prog.methods
          .graduate()
          .accountsPartial({ market: a.publicKey, synthMint: mint, poolToken: pool })
          .rpc();
        console.log(`auto-migrated ${key.slice(0, 8)} to AMM: ${sig.slice(0, 16)}`);
      } catch (e: any) {
        console.log("auto-migrate failed:", String(e.message).slice(0, 80));
      } finally {
        graduating.delete(key);
      }
    }
  } catch {}
}
setInterval(autoGraduate, 10_000);

restore();
subscribe();
setInterval(persist, 15_000);
server.listen(PORT, () => console.log(`indexer on :${PORT}`));
