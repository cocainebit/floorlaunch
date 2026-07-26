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
import { devLaunch, loadListings } from "./launch.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const WS_RPC = process.env.RPC_WS_URL ?? RPC.replace("http", "ws").replace("8899", "8900");
const PROGRAM_ID = process.env.PROGRAM_ID ?? "QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM";
const IDL_PATH = process.env.IDL_PATH ?? new URL("../../target/idl/floorlaunch.json", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = new URL("../data", import.meta.url).pathname;

const LAMPORTS_PER_SOL = 1e9;
const BASE_UNITS_PER_TOKEN = 1e6;
const TOKENS_PER_UNIT = 1e6;

interface Trade {
  ts: number;            // unix seconds
  side: "buy" | "sell";
  priceSol: number;      // SOL per single token
  solAmount: number;     // SOL
  tokenAmount: number;   // whole tokens
  phase: "curve" | "amm";
  sig: string;
  user: string;
}
interface Tick { ts: number; value: number }

interface MarketStore {
  trades: Trade[];
  index: Tick[];       // SOL per token
  funding: { ts: number; rateBpsPerDay: number; mark: number; index: number }[];
}

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

function handleEvent(rawName: string, data: any, sig: string, ts: number) {
  const name = rawName.charAt(0).toLowerCase() + rawName.slice(1);
  if (!["curveTraded", "ammTraded", "indexPushed", "fundingAccrued", "shortChanged", "graduated", "breakerTripped", "liquidated"].includes(name)) {
    console.log("unhandled event:", rawName);
  }
  if (name === "curveTraded" || name === "ammTraded") {
    const market = data.market.toBase58();
    const t: Trade = {
      ts,
      side: fld(data, "isBuy", "is_buy") ? "buy" : "sell",
      priceSol: perTokenSol(n(fld(data, "solAmount", "sol_amount")), n(fld(data, "tokenAmount", "token_amount"))),
      solAmount: n(fld(data, "solAmount", "sol_amount")) / LAMPORTS_PER_SOL,
      tokenAmount: n(fld(data, "tokenAmount", "token_amount")) / BASE_UNITS_PER_TOKEN,
      phase: name === "curveTraded" ? "curve" : "amm",
      sig,
      user: data.user.toBase58(),
    };
    store(market).trades.push(t);
    broadcast({ type: "trade", market, trade: t });
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
    try {
      for (const ev of eventParser.parseLogs(logs.logs)) {
        handleEvent(ev.name, ev.data, logs.signature, ts);
      }
    } catch {}
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
app.use(cors());
app.use(express.json());

app.get("/listings", (_req, res) => res.json(loadListings()));

app.post("/dev/launch", async (req, res) => {
  try {
    const r = await devLaunch(RPC, PROGRAM_ID, structuredClone(idl), req.body);
    res.json(r);
  } catch (e: any) {
    res.status(400).json({ error: String(e.message ?? e).slice(0, 200) });
  }
});

app.get("/markets", async (_req, res) => {
  try {
    const accounts = await (program.account as any).market.all();
    res.json(
      accounts.map((a: any) => ({
        market: a.publicKey.toBase58(),
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
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

restore();
subscribe();
setInterval(persist, 15_000);
server.listen(PORT, () => console.log(`indexer on :${PORT}`));
