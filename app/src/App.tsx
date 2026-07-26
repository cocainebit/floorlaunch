import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "./components/Chart";
import TradePanel from "./components/TradePanel";
import HedgePanel from "./components/HedgePanel";
import UnderlyingStrip from "./components/UnderlyingStrip";
import Panels from "./components/Panels";
import {
  fetchMarkets,
  fetchTrades,
  fetchFunding,
  subscribe,
  type MarketInfo,
  type Trade,
  type IndexTick,
  type FundingTick,
} from "./api";
import { COLLECTION_META } from "./config";
import { useFlWallet } from "./wallet";

export default function App() {
  const wallet = useFlWallet();
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [funding, setFunding] = useState<FundingTick[]>([]);
  const [lastTrade, setLastTrade] = useState<Trade | null>(null);
  const [lastIndexTick, setLastIndexTick] = useState<IndexTick | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const load = () =>
      fetchMarkets()
        .then((ms) => {
          setMarkets(ms);
          if (!selectedRef.current && ms.length) setSelected(ms[0].market);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetchTrades(selected).then(setTrades).catch(() => {});
    fetchFunding(selected).then(setFunding).catch(() => {});
  }, [selected]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.market !== selectedRef.current) return;
      if (msg.type === "trade") {
        setLastTrade(msg.trade);
        setTrades((t) => [msg.trade, ...t].slice(0, 60));
      } else if (msg.type === "index") {
        setLastIndexTick(msg.tick);
      } else if (msg.type === "funding") {
        setFunding((f) => [...f, msg.tick].slice(-200));
      }
    });
  }, []);

  const market = useMemo(
    () => markets.find((m) => m.market === selected) ?? null,
    [markets, selected]
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          floor<span className="brand-accent">launch</span>
        </div>
        <nav className="nav">
          <span className="nav-item active">Markets</span>
          <span className="nav-item">Launch</span>
          <span className="nav-item">Docs</span>
        </nav>
        <div className="top-right">
          <select
            className="market-select"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {markets.map((m) => (
              <option key={m.market} value={m.market}>
                {(COLLECTION_META[m.collection]?.name ?? m.market.slice(0, 8)) +
                  " · " +
                  (COLLECTION_META[m.collection]?.ticker ?? "")}
              </option>
            ))}
          </select>
          <button
            className="wallet-btn"
            onClick={() => (wallet.connected ? wallet.disconnect() : wallet.connect())}
            title={wallet.connected ? "Click to disconnect" : "Connect a Solana wallet"}
          >
            {wallet.label}
          </button>
        </div>
      </header>

      {market ? (
        <main className="layout">
          <div className="col-main">
            <UnderlyingStrip m={market} />
            <Chart
              market={market.market}
              lastTrade={lastTrade}
              lastIndexTick={lastIndexTick}
            />
            <Panels m={market} trades={trades} funding={funding} />
          </div>
          <div className="col-side">
            <TradePanel m={market} />
            <HedgePanel m={market} />
          </div>
        </main>
      ) : (
        <div className="empty-state page-empty">Waiting for markets…</div>
      )}
    </div>
  );
}
