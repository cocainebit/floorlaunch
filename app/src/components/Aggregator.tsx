import { useEffect, useState } from "react";
import { INDEXER_HTTP } from "../config";
import { fmtUsd } from "../fmt";

interface AggMarket {
  market: string;
  ticker: string;
  status: string;
  priceSol: number;
  premiumPct: number | null;
}
interface AggRow {
  identifier: string;
  name: string;
  category: string;
  kind: string;
  image: string | null;
  snapshotSol: number | null;
  liveSol: number | null;
  chainSol: number | null;
  spreadPct: number | null;
  listed: number | null;
  weeklyVolSol: number | null;
  solUsd: number;
  markets: AggMarket[];
}

const sol = (v: number | null) => (v == null ? "–" : `${v.toFixed(3)} SOL`);
const usd = (v: number | null, solUsd: number) =>
  v == null || solUsd <= 0 ? "" : fmtUsd(v * solUsd, 3);

export default function Aggregator({
  focus,
  onOpenMarket,
}: {
  focus?: string | null;
  onOpenMarket: (market: string) => void;
}) {
  const [rows, setRows] = useState<AggRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("all");

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch(`${INDEXER_HTTP}/aggregator`)
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (Array.isArray(d)) setRows(d);
          else setError(d.error ?? "failed to load");
        })
        .catch((e) => !dead && setError(String(e)));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!focus || !rows) return;
    const el = document.getElementById(`agg-${focus}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, rows]);

  if (error) return <div className="card agg-card">index aggregator: {error}</div>;
  if (!rows) return <div className="card agg-card">loading price sources…</div>;

  const cats = ["all", ...new Set(rows.map((r) => r.category))];
  const shown = rows.filter((r) => cat === "all" || r.category === cat);

  return (
    <div className="card agg-card">
      <div className="agg-head">
        <div>
          <div className="agg-title">Floor index aggregator</div>
          <div className="agg-sub">
            Every listed collectible with all its price sources: allowlist
            snapshot, live marketplace floor, and the on-chain oracle index,
            plus the spread between them and every token launched against it.
          </div>
        </div>
        <div className="agg-cats">
          {cats.map((c) => (
            <button
              key={c}
              className={`pill ${cat === c ? "active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="agg-scroll">
        <table className="agg-table">
          <thead>
            <tr>
              <th>Collectible</th>
              <th className="num">Snapshot</th>
              <th className="num">Live floor</th>
              <th className="num">Oracle index</th>
              <th className="num">Spread</th>
              <th className="num">Listed</th>
              <th className="num">7d vol</th>
              <th>Markets</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.identifier} id={`agg-${r.identifier}`} className={focus === r.identifier ? "agg-focus" : ""}>
                <td>
                  <div className="agg-name">
                    {r.image ? <img src={r.image} alt="" /> : <span className="agg-imgless" />}
                    <div>
                      <div>{r.name}</div>
                      <div className="dim">{r.category}</div>
                    </div>
                  </div>
                </td>
                <td className="num mono">
                  {sol(r.snapshotSol)}
                  <div className="dim">{usd(r.snapshotSol, r.solUsd)}</div>
                </td>
                <td className="num mono">
                  {sol(r.liveSol)}
                  <div className="dim">{usd(r.liveSol, r.solUsd)}</div>
                </td>
                <td className="num mono">
                  {sol(r.chainSol)}
                  <div className="dim">{usd(r.chainSol, r.solUsd)}</div>
                </td>
                <td className={`num mono ${r.spreadPct != null && r.spreadPct > 10 ? "warn" : ""}`}>
                  {r.spreadPct == null ? "–" : `${r.spreadPct.toFixed(1)}%`}
                </td>
                <td className="num mono">{r.listed ?? "–"}</td>
                <td className="num mono">
                  {r.weeklyVolSol == null ? "–" : `${Math.round(r.weeklyVolSol).toLocaleString()} SOL`}
                </td>
                <td>
                  {r.markets.length === 0 ? (
                    <span className="dim">none yet</span>
                  ) : (
                    r.markets.map((m) => (
                      <button
                        key={m.market}
                        className="agg-mkt"
                        onClick={() => onOpenMarket(m.market)}
                        title={`${m.status} · ${m.premiumPct == null ? "" : `${m.premiumPct.toFixed(1)}% vs index`}`}
                      >
                        {m.ticker}
                        {m.status !== "live" ? (
                          <span className="dim"> curve</span>
                        ) : m.premiumPct != null ? (
                          <span className={m.premiumPct >= 0 ? "up" : "down"}>
                            {" "}
                            {m.premiumPct >= 0 ? "+" : ""}
                            {m.premiumPct.toFixed(1)}%
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
