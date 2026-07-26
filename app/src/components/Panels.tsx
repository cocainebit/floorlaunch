import { useEffect, useState } from "react";
import type { MarketInfo, Trade, FundingTick } from "../api";
import { useFlWallet } from "../wallet";
import { fetchPosition, repayBurn, type PositionView } from "../tx";

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

function PositionTab({ m }: { m: MarketInfo }) {
  const wallet = useFlWallet();
  const [pos, setPos] = useState<PositionView | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (!wallet.provider) return;
    fetchPosition(wallet.provider, m.market, m.indexPerToken, m.fundingIndex)
      .then(setPos)
      .catch(() => {});
  };
  useEffect(refresh, [wallet.connected, m.market, m.indexPerToken]);

  if (!wallet.connected) {
    return (
      <div className="empty-state">
        Connect a wallet to see your balance, hedge position, collateral
        ratio, and claimable exits.
      </div>
    );
  }
  if (!pos) return <div className="empty-state">Loading position…</div>;

  const rows: [string, string][] = [
    ["Token balance", `${pos.tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`],
    ["Floor exposure", `${(pos.tokenBalance / 1e6).toFixed(4)} units`],
    ["Hedge collateral", `${pos.collateralSol.toFixed(3)} SOL`],
    ["Hedge debt", `${pos.debtTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`],
    ["Collateral ratio", pos.crPct ? `${pos.crPct.toFixed(1)}%` : "–"],
    ["Liquidation index", pos.liqIndexSolPerUnit ? `${pos.liqIndexSolPerUnit.toFixed(2)} SOL per unit` : "–"],
  ];

  async function repayAll() {
    if (!wallet.provider || !pos || pos.debtTokens <= 0) return;
    setBusy(true);
    try {
      await repayBurn(
        wallet.provider,
        m.market,
        Math.min(pos.debtTokens, pos.tokenBalance)
      );
      refresh();
    } catch {}
    setBusy(false);
  }

  return (
    <div className="stats-grid">
      {rows.map(([k, v]) => (
        <div className="stat-row" key={k}>
          <span className="dim">{k}</span>
          <span className={`mono ${k === "Collateral ratio" && pos.crPct && pos.crPct < 135 ? "warn" : ""}`}>{v}</span>
        </div>
      ))}
      {pos.debtTokens > 0 && (
        <button className="cta neutral" onClick={repayAll} disabled={busy}>
          {busy ? "Confirming…" : "Repay from balance"}
        </button>
      )}
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
      {tab === "position" && <PositionTab m={m} />}
    </div>
  );
}
