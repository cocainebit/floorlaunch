import { INDEXER_HTTP, INDEXER_WS } from "./config";

export interface MarketInfo {
  market: string;
  solUsd: number;
  collection: string;
  synthMint: string;
  status: string;
  venue: string;
  frozen: boolean;
  indexPerToken: number;
  markPerToken: number;
  indexLastTs: number;
  feedAgeSec: number | null;
  ammSolReserve: number;
  ammTokenReserve: number;
  insuranceSol: number;
  totalCollateralSol: number;
  curveSolRaised: number;
  curveVirtualSol: number;
  curveVirtualTokens: number;
  graduationTargetSol: number;
  fundingIndex: string;
  maxOpenInterest: number;
  itemsDeposited: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

export interface Trade {
  ts: number;
  side: "buy" | "sell";
  priceSol: number;
  solAmount: number;
  tokenAmount: number;
  phase: string;
  sig: string;
  user: string;
}

export interface IndexTick {
  ts: number;
  value: number;
}

export interface FundingTick {
  ts: number;
  rateBpsPerDay: number;
  mark: number;
  index: number;
}

const get = async <T>(path: string): Promise<T> => {
  const r = await fetch(`${INDEXER_HTTP}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

export interface ListingMeta {
  ticker: string;
  name: string;
  image: string | null;
  links: Record<string, string | undefined>;
  feeReceiver: { kind: string; value: string };
  identifier: string;
  itemMints?: string[];
}

export const fetchMarkets = () => get<MarketInfo[]>("/markets");
export const fetchListings = () => get<Record<string, ListingMeta>>("/listings");
export const fetchCandles = (m: string, tf: number, limit = 500) =>
  get<Candle[]>(`/candles/${m}?tf=${tf}&limit=${limit}`);
export const fetchTrades = (m: string, limit = 60) =>
  get<Trade[]>(`/trades/${m}?limit=${limit}`);
export const fetchIndex = (m: string, limit = 2000) =>
  get<IndexTick[]>(`/index/${m}?limit=${limit}`);
export const fetchFunding = (m: string, limit = 200) =>
  get<FundingTick[]>(`/funding/${m}?limit=${limit}`);

export type WsMessage =
  | { type: "trade"; market: string; trade: Trade }
  | { type: "index"; market: string; tick: IndexTick }
  | { type: "funding"; market: string; tick: FundingTick };

export function subscribe(onMessage: (m: WsMessage) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  const connect = () => {
    ws = new WebSocket(INDEXER_WS);
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      if (!closed) setTimeout(connect, 1500);
    };
  };
  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
