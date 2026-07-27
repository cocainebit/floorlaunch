import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { pdas } from "../tx";
import { RPC_URL } from "../wallet";
import type { MarketInfo, Trade, FundingTick } from "../api";
import { useFlWallet } from "../wallet";
import { fetchPosition, repayBurn, type PositionView } from "../tx";

const PER_UNIT = 1_000_000;

const hhmmss = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("en-GB", { hour12: false });

function TradesTable({ trades, solUsd }: { trades: Trade[]; solUsd: number }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Side</th>
            <th className="num">Price ($/unit)</th>
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
              <td className="num mono">
                {solUsd > 0
                  ? `$${(t.priceSol * PER_UNIT * solUsd).toFixed(2)}`
                  : (t.priceSol * PER_UNIT).toFixed(3)}
              </td>
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

function HoldersTab({ m }: { m: MarketInfo }) {
  const [rows, setRows] = useState<
    { address: string; tokens: number; label: string | null }[]
  >([]);
  const [supply, setSupply] = useState(0);

  useEffect(() => {
    const conn = new Connection(RPC_URL, "confirmed");
    const p = pdas(new PublicKey(m.market));
    (async () => {
      try {
        const sup = await conn.getTokenSupply(new PublicKey(m.synthMint));
        setSupply(Number(sup.value.amount) / 1e6);
        const largest = await conn.getTokenLargestAccounts(new PublicKey(m.synthMint));
        const labels: Record<string, string> = {
          [p.pool.toBase58()]: m.status === "live" ? "AMM pool" : "launch curve",
          [p.treasury.toBase58()]: "hedge reserve",
        };
        setRows(
          largest.value.slice(0, 10).map((h) => ({
            address: h.address.toBase58(),
            tokens: Number(h.amount) / 1e6,
            label: labels[h.address.toBase58()] ?? null,
          }))
        );
      } catch {}
    })();
  }, [m.market, m.status]);

  // Value each holder's tokens in USD at the current mark (pool stays
  // SOL-paired; USD is display-layer via the cached SOL price).
  const perTokenUsd = m.markPerToken > 0 ? m.markPerToken * m.solUsd : (m.indexPerToken * m.solUsd);
  return (
    <div className="stats-grid">
      {rows.map((h) => (
        <div className="stat-row" key={h.address}>
          <span className={h.label ? "" : "dim"}>
            {h.label ?? `${h.address.slice(0, 6)}..${h.address.slice(-6)}`}
            {h.label && (
              <span className="chip chip-dim holder-chip">
                {h.address.slice(0, 4)}..{h.address.slice(-4)}
              </span>
            )}
          </span>
          <span className="mono">
            ${(h.tokens * perTokenUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {supply > 0 && (
              <span className="dim"> ({((h.tokens / supply) * 100).toFixed(1)}%)</span>
            )}
          </span>
        </div>
      ))}
      {rows.length === 0 && <div className="empty-state">loading holders…</div>}
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
  const [tab, setTab] = useState<"trades" | "stats" | "holders" | "position">("trades");
  return (
    <div className="card panels-card">
      <div className="tab-row">
        {(
          [
            ["trades", "Recent trades"],
            ["stats", "Market stats"],
            ["holders", "Holders"],
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
      {tab === "trades" && <TradesTable trades={trades} solUsd={m.solUsd} />}
      {tab === "stats" && <Stats m={m} funding={funding} />}
      {tab === "holders" && <HoldersTab m={m} />}
      {tab === "position" && <PositionTab m={m} />}
    </div>
  );
}
