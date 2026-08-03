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
} from "@meteora-ag/dynamic-bonding-curve-sdk";
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
  phase: "curve" | "amm" | "meteora";
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

async function pollMeteoraTrades() {
  const listings = loadListings();
  for (const [market, meta] of Object.entries(listings)) {
    const m: any = meta;
    if (m.venue !== "meteora" || !m.dbcPool) continue;
    try {
      const v = await poolVaults(m.dbcPool);
      if (!v) continue;
      const poolPk = new PublicKey(m.dbcPool);
      const first = !meteoraLastSig.has(m.dbcPool);
      const sigs = await connection.getSignaturesForAddress(poolPk, { limit: first ? 100 : 25 });
      const last = meteoraLastSig.get(m.dbcPool);
      const fresh: typeof sigs = [];
      for (const s of sigs) {
        if (s.signature === last) break;
        if (!s.err) fresh.push(s);
      }
      fresh.reverse(); // oldest first
      for (const s of fresh) {
        if (seenSigs.has(s.signature)) continue;
        seenSigs.add(s.signature);
        try {
          const tx = await connection.getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          const trade = parseMeteoraSwap(tx, v.base, v.quote, s.blockTime ?? Math.floor(Date.now() / 1000), s.signature);
          if (trade) {
            store(market).trades.push(trade);
            broadcast({ type: "trade", market, trade });
          }
        } catch {}
      }
      if (sigs[0]) meteoraLastSig.set(m.dbcPool, sigs[0].signature);
    } catch {}
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
          };
          // External (Meteora DBC) markets: override the traded price + liquidity
          // with the live pool so the explorer reflects the real Meteora venue.
          if (meta?.venue === "meteora" && meta.dbcPool) {
            row.venue = "meteora";
            row.dbcPool = meta.dbcPool;
            const pool = await meteoraPool(meta.dbcPool);
            if (pool) {
              row.markPerToken = pool.markPerToken;
              row.ammSolReserve = pool.solReserve;
              row.ammTokenReserve = pool.tokenReserve;
            }
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
// Meteora pool swap indexing for external markets (Activity + candles).
setInterval(pollMeteoraTrades, 15_000);
setTimeout(pollMeteoraTrades, 8_000);

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
