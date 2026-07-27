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
import { devLaunch, loadListings, catalogByIdentifier } from "./launch.js";
import {
  getOrCreateEscrow,
  startVerification,
  checkVerification,
  listEscrows,
  initEscrow,
  type Platform,
} from "./escrow.js";

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
    const solUsd = await getSolUsd();
    const listings = loadListings();
    res.json(
      accounts.map((a: any) => {
        // The on-chain index is launch-scaled (0.625 SOL per unit at
        // launch); recover the collectible's real price from the listing.
        const meta: any = listings[a.publicKey.toBase58()];
        const scaledUnitSol = Number(a.account.indexTwap) / LAMPORTS_PER_SOL;
        const cardIndexSol =
          meta?.indexAtLaunchLamports > 0
            ? (scaledUnitSol / 0.625) * (meta.indexAtLaunchLamports / LAMPORTS_PER_SOL)
            : scaledUnitSol;
        return {
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
      })
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

initEscrow(idl);

// Oracle refresher: keeps every launched market's feed fresh by re-pushing
// the allowlist-derived index every 5 minutes (localnet stand-in for the
// production relayer following the listings file).
async function refreshOracles() {
  try {
    const { Keypair } = await import("@solana/web3.js");
    const anchorMod = await import("@coral-xyz/anchor");
    const { readFileSync } = await import("node:fs");
    const { homedir } = await import("node:os");
    const oracle = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/floorlaunch/relayer/keys/oracle-sim.json`, "utf8")))
    );
    const provider = new anchorMod.AnchorProvider(connection, new anchorMod.Wallet(oracle), {
      commitment: "confirmed",
    });
    const prog = new anchorMod.Program(structuredClone(idl), provider);
    // Localnet self-funding: the oracle pays its own push fees.
    if (RPC.includes("127.0.0.1") || RPC.includes("localhost")) {
      const bal = await connection.getBalance(oracle.publicKey);
      if (bal < 1e8) {
        try {
          const sig = await connection.requestAirdrop(oracle.publicKey, 10e9);
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
        const lamports =
          u.kind === "nft"
            ? Math.round(u.snapshot.floorSol * 1e9)
            : Math.round(((u.usdPrice ?? u.snapshot.ccFloorUsd) / solUsd) * 1e9);
        if (!(lamports > 0)) continue;
        // The on-chain index is launch-scaled: 0.625 SOL per unit at
        // launch, moving with the collectible from there.
        const atLaunch = (meta as any).indexAtLaunchLamports;
        const scaled = atLaunch > 0 ? Math.round((lamports / atLaunch) * 625_000_000) : lamports;
        await prog.methods
          .pushIndex(new (await import("bn.js")).default(scaled))
          .accountsPartial({
            global: globalPda,
            oracleAuthority: oracle.publicKey,
            market: new PublicKey(market),
          })
          .signers([oracle])
          .rpc();
      } catch {}
    }
  } catch {}
}
setInterval(refreshOracles, 300_000);
setTimeout(refreshOracles, 15_000);

// Auto-migration: when a curve reaches its graduation target the market
// migrates to the AMM automatically (graduate is permissionless; the
// indexer pays the fee). Swept every 10s and nudged by trade events.
let graduating = new Set<string>();
async function autoGraduate() {
  try {
    const { Keypair } = await import("@solana/web3.js");
    const anchorMod = await import("@coral-xyz/anchor");
    const { readFileSync } = await import("node:fs");
    const { homedir } = await import("node:os");
    const admin = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")))
    );
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
