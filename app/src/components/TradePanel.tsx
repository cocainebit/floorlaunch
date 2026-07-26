import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "../wallet";
import type { MarketInfo } from "../api";
import { useFlWallet } from "../wallet";
import { ammBuy, ammSell, curveBuy, curveSell } from "../tx";

const FEE_BPS = 70;
const SLIPPAGE = 0.02; // 2% guard on the quoted output

const isCurve = (m: MarketInfo) => m.status === "bootstrap";
const reserves = (m: MarketInfo) =>
  isCurve(m)
    ? { sol: m.curveVirtualSol, tok: m.curveVirtualTokens }
    : { sol: m.ammSolReserve, tok: m.ammTokenReserve };

function quoteBuy(m: MarketInfo, solIn: number) {
  const { sol, tok } = reserves(m);
  const net = solIn * (1 - FEE_BPS / 10_000);
  const k = sol * tok;
  const out = tok - k / (sol + net);
  const eff = net / out;
  return { out, impact: (eff / (sol / tok) - 1) * 100, fee: solIn * (FEE_BPS / 10_000) };
}
function quoteSell(m: MarketInfo, tokensIn: number) {
  const { sol, tok } = reserves(m);
  const k = sol * tok;
  const gross = sol - k / (tok + tokensIn);
  const out = gross * (1 - FEE_BPS / 10_000);
  const eff = gross / tokensIn;
  return { out, impact: (1 - eff / (sol / tok)) * 100, fee: gross * (FEE_BPS / 10_000) };
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; sig: string }
  | { kind: "error"; msg: string };

export default function TradePanel({ m }: { m: MarketInfo }) {
  const wallet = useFlWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [payMode, setPayMode] = useState<"sol" | "collectible">("sol");
  const [nfts, setNfts] = useState<string[]>([]);
  const [amount, setAmount] = useState("1.0");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const amt = parseFloat(amount) || 0;

  useEffect(() => setStatus({ kind: "idle" }), [m.market, m.status]);

  // Wallet's on-chain collectibles (decimals-0, amount-1 tokens): holders
  // of the real item can enter the market by routing it in at the floor.
  useEffect(() => {
    if (!wallet.publicKey || payMode !== "collectible") return;
    const conn = new Connection(RPC_URL, "confirmed");
    conn
      .getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .then((r) => {
        setNfts(
          r.value
            .map((a: any) => a.account.data.parsed.info)
            .filter((i: any) => i.tokenAmount.decimals === 0 && i.tokenAmount.uiAmount === 1)
            .map((i: any) => i.mint)
        );
      })
      .catch(() => setNfts([]));
  }, [wallet.publicKey?.toBase58(), payMode, m.market]);

  const q = amt > 0 ? (side === "buy" ? quoteBuy(m, amt) : quoteSell(m, amt)) : null;

  async function submit() {
    if (!wallet.provider || !q) return;
    setStatus({ kind: "sending" });
    try {
      const buyFn = isCurve(m) ? curveBuy : ammBuy;
      const sellFn = isCurve(m) ? curveSell : ammSell;
      const r =
        side === "buy"
          ? await buyFn(wallet.provider, m.market, amt, q.out * (1 - SLIPPAGE))
          : await sellFn(wallet.provider, m.market, amt, q.out * (1 - SLIPPAGE));
      setStatus({ kind: "ok", sig: r.sig });
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const anchorErr = msg.match(/Error Message: ([^.]+)/)?.[1];
      setStatus({ kind: "error", msg: anchorErr ?? msg.slice(0, 90) });
    }
  }

  const curveProgress = isCurve(m)
    ? Math.min(100, (m.curveSolRaised / m.graduationTargetSol) * 100)
    : null;

  return (
    <div className="card trade-card">
      {curveProgress !== null && (
        <div className="curve-banner">
          <div className="row">
            <span>Launch curve</span>
            <span className="mono">
              {m.curveSolRaised.toFixed(2)} / {m.graduationTargetSol.toFixed(0)} SOL
            </span>
          </div>
          <div className="curve-bar">
            <div className="curve-fill" style={{ width: `${curveProgress}%` }} />
          </div>
          <div className="curve-note dim">
            {curveProgress >= 100
              ? "Migrating to the AMM…"
              : "Migrates to the AMM automatically at the target."}
          </div>
        </div>
      )}
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

      {side === "buy" && (
        <div className="pay-modes">
          <button className={`pay-mode ${payMode === "sol" ? "active" : ""}`} onClick={() => setPayMode("sol")}>
            Pay with SOL
          </button>
          <button
            className={`pay-mode ${payMode === "collectible" ? "active" : ""}`}
            onClick={() => setPayMode("collectible")}
          >
            Pay with the collectible
          </button>
        </div>
      )}
      {side === "buy" && payMode === "collectible" ? (
        <div className="collectible-pay">
          {wallet.connected ? (
            nfts.length > 0 ? (
              <>
                <div className="row">
                  <span>On-chain items in wallet</span>
                  <span className="mono">{nfts.length}</span>
                </div>
                <div className="row">
                  <span>1 item at the live index</span>
                  <span className="mono">{(m.indexPerToken * 1e6).toFixed(3)} SOL</span>
                </div>
                <div className="row">
                  <span>≈ tokens received</span>
                  <span className="mono">
                    {quoteBuy(m, m.indexPerToken * 1e6).out.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <button className="cta buy" disabled title="Marketplace routing ships with the devnet deployment">
                  Route item → tokens (soon)
                </button>
                <div className="dim form-note">
                  Sells your item into the real floor (Magic Eden / Collector Crypt) at the live
                  price and buys the token with the proceeds, one flow. Requires public-cluster
                  marketplaces; on localnet this is preview only.
                </div>
              </>
            ) : (
              <div className="dim form-note">
                No on-chain collectibles detected in this wallet. Holders of the real item (a
                collection NFT or vaulted card) can swap it straight into the token here.
              </div>
            )
          ) : (
            <button className="cta buy" onClick={wallet.connect}>Connect wallet</button>
          )}
        </div>
      ) : (
      <>
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
      </>
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
