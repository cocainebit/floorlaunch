import { useState } from "react";
import type { MarketInfo } from "../api";
import { useFlWallet } from "../wallet";
import { ammBuy, ammSell } from "../tx";

const FEE_BPS = 70;
const SLIPPAGE = 0.02; // 2% guard on the quoted output

function quoteBuy(m: MarketInfo, solIn: number) {
  const net = solIn * (1 - FEE_BPS / 10_000);
  const k = m.ammSolReserve * m.ammTokenReserve;
  const out = m.ammTokenReserve - k / (m.ammSolReserve + net);
  const mid = m.ammSolReserve / m.ammTokenReserve;
  const eff = net / out;
  return { out, impact: (eff / mid - 1) * 100, fee: solIn * (FEE_BPS / 10_000) };
}
function quoteSell(m: MarketInfo, tokensIn: number) {
  const k = m.ammSolReserve * m.ammTokenReserve;
  const gross = m.ammSolReserve - k / (m.ammTokenReserve + tokensIn);
  const out = gross * (1 - FEE_BPS / 10_000);
  const mid = m.ammSolReserve / m.ammTokenReserve;
  const eff = gross / tokensIn;
  return { out, impact: (1 - eff / mid) * 100, fee: gross * (FEE_BPS / 10_000) };
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; sig: string }
  | { kind: "error"; msg: string };

export default function TradePanel({ m }: { m: MarketInfo }) {
  const wallet = useFlWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1.0");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const amt = parseFloat(amount) || 0;

  const q = amt > 0 ? (side === "buy" ? quoteBuy(m, amt) : quoteSell(m, amt)) : null;

  async function submit() {
    if (!wallet.provider || !q) return;
    setStatus({ kind: "sending" });
    try {
      const r =
        side === "buy"
          ? await ammBuy(wallet.provider, m.market, amt, q.out * (1 - SLIPPAGE))
          : await ammSell(wallet.provider, m.market, amt, q.out * (1 - SLIPPAGE));
      setStatus({ kind: "ok", sig: r.sig });
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const anchorErr = msg.match(/Error Message: ([^.]+)/)?.[1];
      setStatus({ kind: "error", msg: anchorErr ?? msg.slice(0, 90) });
    }
  }

  return (
    <div className="card trade-card">
      <div className="side-tabs">
        <button
          className={`side-tab buy ${side === "buy" ? "active" : ""}`}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          className={`side-tab sell ${side === "sell" ? "active" : ""}`}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>

      <label className="field-label">
        {side === "buy" ? "You pay (SOL)" : "You sell (tokens)"}
      </label>
      <div className="amount-row">
        <input
          className="amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
        <div className="quick-group">
          {(side === "buy" ? ["0.1", "0.5", "1", "5"] : ["1000", "10000", "50000"]).map(
            (v) => (
              <button key={v} className="quick-btn" onClick={() => setAmount(v)}>
                {v}
              </button>
            )
          )}
        </div>
      </div>

      <div className="quote-rows">
        <div className="row">
          <span>You receive</span>
          <span className="mono">
            {q
              ? side === "buy"
                ? `${q.out.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`
                : `${q.out.toFixed(4)} SOL`
              : "–"}
          </span>
        </div>
        <div className="row">
          <span>Fee (0.70%)</span>
          <span className="mono">{q ? `${q.fee.toFixed(4)} SOL` : "–"}</span>
        </div>
        <div className="row">
          <span>Price impact</span>
          <span className={`mono ${q && q.impact > 2 ? "warn" : ""}`}>
            {q ? `${q.impact.toFixed(2)}%` : "–"}
          </span>
        </div>
      </div>

      {wallet.connected ? (
        <button
          className={`cta ${side}`}
          onClick={submit}
          disabled={!q || status.kind === "sending" || m.frozen}
        >
          {m.frozen
            ? "Market frozen"
            : status.kind === "sending"
              ? "Confirming…"
              : side === "buy"
                ? "Buy"
                : "Sell"}
        </button>
      ) : (
        <button className={`cta ${side}`} onClick={wallet.connect}>
          Connect wallet
        </button>
      )}

      {status.kind === "ok" && (
        <div className="tx-note ok">
          Filled · <span className="mono">{status.sig.slice(0, 16)}…</span>
        </div>
      )}
      {status.kind === "error" && (
        <div className="tx-note err">{status.msg}</div>
      )}

      <div className="claim-strip">
        <div className="claim-title">Exit into the real thing</div>
        <div className="claim-body">
          Sell routes through the floor market: exits above one floor unit can
          be claimed as the actual NFT or card plus SOL change.
        </div>
      </div>
    </div>
  );
}
