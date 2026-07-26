import { useState } from "react";
import type { MarketInfo } from "../api";
import { useFlWallet } from "../wallet";
import { openShort } from "../tx";

const PER_UNIT = 1_000_000;

export default function HedgePanel({ m }: { m: MarketInfo }) {
  const wallet = useFlWallet();
  const [collateral, setCollateral] = useState("10");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const col = parseFloat(collateral) || 0;
  const indexUnit = m.indexPerToken * PER_UNIT;

  // Draw at a safety margin above the 150% minimum so a small index move
  // does not immediately sit at the open boundary.
  const unitsMax = indexUnit > 0 ? col / (indexUnit * 1.55) : 0;
  const tokensMax = unitsMax * PER_UNIT;
  const liqIndex = unitsMax > 0 ? col / (unitsMax * 1.2) : 0;

  async function submit() {
    if (!wallet.provider || tokensMax <= 0) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await openShort(wallet.provider, m.market, col, Math.floor(tokensMax));
      setStatus(`Hedge opened · ${r.sig.slice(0, 14)}…`);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      setStatus(msg.match(/Error Message: ([^.]+)/)?.[1] ?? msg.slice(0, 80));
    }
    setBusy(false);
  }

  return (
    <div className="card hedge-card">
      <div className="panel-title">
        Hedge{" "}
        <span className="panel-sub">
          draw synth against SOL, sell it, keep your floor exposure flat
        </span>
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
          <span>Draw (~155% CR)</span>
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
      {wallet.connected ? (
        <button
          className="cta neutral"
          onClick={submit}
          disabled={busy || tokensMax <= 0 || m.frozen}
        >
          {m.frozen ? "Market frozen" : busy ? "Confirming…" : "Open hedge"}
        </button>
      ) : (
        <button className="cta neutral" onClick={wallet.connect}>
          Connect wallet
        </button>
      )}
      {status && <div className="tx-note">{status}</div>}
    </div>
  );
}
