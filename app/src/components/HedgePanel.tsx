import { useState } from "react";
import type { MarketInfo } from "../api";

const PER_UNIT = 1_000_000;

export default function HedgePanel({ m }: { m: MarketInfo }) {
  const [collateral, setCollateral] = useState("10");
  const col = parseFloat(collateral) || 0;
  const indexUnit = m.indexPerToken * PER_UNIT;

  // Max draw at 150% initial CR; liquidation when CR < 120%.
  const unitsMax = indexUnit > 0 ? col / (indexUnit * 1.5) : 0;
  const tokensMax = unitsMax * PER_UNIT;
  const liqIndex = unitsMax > 0 ? col / (unitsMax * 1.2) : 0;

  return (
    <div className="card hedge-card">
      <div className="panel-title">
        Hedge <span className="panel-sub">draw synth against SOL, sell it, keep your floor exposure flat</span>
      </div>
      <label className="field-label">Collateral (SOL)</label>
      <input
        className="amount-input"
        value={collateral}
        onChange={(e) => setCollateral(e.target.value)}
        inputMode="decimal"
      />
      <div className="quote-rows">
        <div className="row">
          <span>Draw at 150% CR</span>
          <span className="mono">
            {tokensMax > 0
              ? `${tokensMax.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`
              : "–"}
          </span>
        </div>
        <div className="row">
          <span>Floor exposure</span>
          <span className="mono">{unitsMax > 0 ? `${unitsMax.toFixed(3)} units` : "–"}</span>
        </div>
        <div className="row">
          <span>Liq. index</span>
          <span className="mono warn">
            {liqIndex > 0 ? `${liqIndex.toFixed(2)} SOL` : "–"}
          </span>
        </div>
      </div>
      <button className="cta neutral" disabled title="Wallet connection ships with the devnet deployment">
        Open hedge
      </button>
    </div>
  );
}
