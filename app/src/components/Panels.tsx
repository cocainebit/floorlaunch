import { useState } from "react";
import type { MarketInfo, Trade, FundingTick } from "../api";

const PER_UNIT = 1_000_000;

const hhmmss = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("en-GB", { hour12: false });

function TradesTable({ trades }: { trades: Trade[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Side</th>
            <th className="num">Price (SOL/unit)</th>
            <th className="num">Tokens</th>
            <th className="num">SOL</th>
            <th>Trader</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.sig + t.ts}>
              <td className="dim">{hhmmss(t.ts)}</td>
              <td className={t.side === "buy" ? "up" : "down"}>
                {t.side === "buy" ? "Buy" : "Sell"}
              </td>
              <td className="num mono">{(t.priceSol * PER_UNIT).toFixed(3)}</td>
              <td className="num mono">
                {t.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td className="num mono">{t.solAmount.toFixed(3)}</td>
              <td className="dim mono">
                {t.user.slice(0, 4)}..{t.user.slice(-4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stats({ m, funding }: { m: MarketInfo; funding: FundingTick[] }) {
  const oiUsed = m.maxOpenInterest - 0; // reserve remaining comes on-chain later
  const last = funding[funding.length - 1];
  const rows: [string, string][] = [
    ["AMM depth", `${m.ammSolReserve.toFixed(2)} SOL / ${m.ammTokenReserve.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`],
    ["Insurance fund", `${m.insuranceSol.toFixed(3)} SOL`],
    ["Hedger collateral", `${m.totalCollateralSol.toFixed(3)} SOL`],
    ["Curve raised", `${m.curveSolRaised.toFixed(2)} SOL`],
    ["Hedge reserve cap", `${m.maxOpenInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`],
    [
      "Funding (last crank)",
      last
        ? `${last.rateBpsPerDay >= 0 ? "+" : ""}${(last.rateBpsPerDay / 100).toFixed(2)}%/day ${last.rateBpsPerDay >= 0 ? "to hedgers" : "from hedgers"}`
        : "–",
    ],
  ];
  return (
    <div className="stats-grid">
      {rows.map(([k, v]) => (
        <div className="stat-row" key={k}>
          <span className="dim">{k}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
      <div className="stat-note">
        Open interest is bounded by the preminted hedge reserve; the treasury
        balance is the hard ceiling. {oiUsed > 0 ? "" : ""}
      </div>
    </div>
  );
}

export default function Panels({
  m,
  trades,
  funding,
}: {
  m: MarketInfo;
  trades: Trade[];
  funding: FundingTick[];
}) {
  const [tab, setTab] = useState<"trades" | "stats" | "position">("trades");
  return (
    <div className="card panels-card">
      <div className="tab-row">
        {(
          [
            ["trades", "Recent trades"],
            ["stats", "Market stats"],
            ["position", "My position"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "trades" && <TradesTable trades={trades} />}
      {tab === "stats" && <Stats m={m} funding={funding} />}
      {tab === "position" && (
        <div className="empty-state">
          Connect a wallet to see your balance, hedge position, collateral
          ratio, and claimable exits.
        </div>
      )}
    </div>
  );
}
