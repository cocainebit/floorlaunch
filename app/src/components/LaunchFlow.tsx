/**
 * Launch wizard, long.xyz-shaped: three focused steps.
 *   1  Pick a collectible (launch a new token on top of it)
 *   2  Finalise your token (name + ticker with live availability)
 *   3  Review and launch
 */
import { useMemo, useState } from "react";
import catalog from "../underlyings.json";
import { useFlWallet } from "../wallet";
import { INDEXER_HTTP } from "../config";
import type { ListingMeta } from "../api";

interface Underlying {
  kind: string;
  identifier: string;
  collectionId: string;
  market: string;
  name: string;
  category: string;
  grade?: string;
  usdPrice?: number;
  symbol?: string;
  image: string | null;
  snapshot: any;
}

const CATEGORIES = ["Pokemon", "One Piece", "NFT collections"] as const;
const RESERVED = new Set(["SOL", "USDC", "BTC", "ETH", "FL", "FLOOR"]);

function suggestTicker(u: Underlying): string {
  const stop = new Set(["the", "of", "and", "full", "art", "ex", "gx", "v", "vmax", "psa"]);
  const words = u.name.split(/[^a-zA-Z]+/).filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  const w = (words.find((x) => /^[A-Z]/.test(x)) ?? words[0] ?? "TOKEN").toUpperCase();
  return w.slice(0, 8);
}

function cleanTitle(u: Underlying): string {
  if (u.kind !== "card") return `${u.name} Floor`;
  const m = u.name.match(/#\S+\s+(.*?)\s+(?:PSA|CGC|BGS)\b/i);
  const title = (m ? m[1] : u.name).replace(/Full Art\//i, "").trim();
  return `${title} ${u.grade}`;
}

function collectiblePage(u: Underlying): string {
  if (u.kind === "nft") return `https://magiceden.io/marketplace/${u.symbol}`;
  return `https://collectorcrypt.com/marketplace?search=${encodeURIComponent(
    u.name.split(/\s+(PSA|CGC)/)[0]
  )}`;
}

const priceLabel = (u: Underlying) =>
  u.kind === "nft"
    ? `${u.snapshot.floorSol} SOL floor · ${u.snapshot.listed} listed`
    : `$${(u.usdPrice ?? u.snapshot.ccFloorUsd).toLocaleString()} · ${u.snapshot.ccListings} vaulted`;

export default function LaunchFlow({
  live,
  listings,
  onLaunched,
}: {
  live: Set<string>;
  listings: Record<string, ListingMeta>;
  onLaunched: (market: string) => void;
}) {
  const wallet = useFlWallet();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Pokemon");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Underlying | null>(null);

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [links, setLinks] = useState({ twitter: "", website: "", discord: "", telegram: "" });
  const [feeMode, setFeeMode] = useState<"wallet" | "address" | "x" | "youtube" | "elitefourum">("wallet");
  const [feeValue, setFeeValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(
    () =>
      (catalog as Underlying[])
        .filter((u) => u.category === cat)
        .filter((u) => u.name.toLowerCase().includes(query.toLowerCase())),
    [cat, query]
  );

  // Live ticker validation, long.xyz-style: letters only, bounded length,
  // availability against every existing listing plus a reserved list.
  const takenTickers = useMemo(
    () => new Set(Object.values(listings).map((l) => l.ticker.replace(/^fl/, "").toUpperCase())),
    [listings]
  );
  const tickerState = useMemo(() => {
    if (!ticker) return { ok: false, msg: "Ticker is required" };
    if (!/^[A-Za-z]+$/.test(ticker)) return { ok: false, msg: "Ticker must contain only letters" };
    if (ticker.length > 8) return { ok: false, msg: "Ticker must be 8 characters or less" };
    const t = ticker.toUpperCase();
    if (RESERVED.has(t)) return { ok: false, msg: `fl${t} is reserved` };
    if (takenTickers.has(t)) return { ok: false, msg: `fl${t} is already live` };
    return { ok: true, msg: `fl${t} is available` };
  }, [ticker, takenTickers]);

  function pick(u: Underlying) {
    setSel(u);
    setTicker(suggestTicker(u));
    setName(cleanTitle(u));
    setError(null);
    setStep(2);
  }

  async function launch() {
    if (!sel || !wallet.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const feeReceiver = await (async () => {
        if (feeMode === "wallet") return { kind: "wallet", value: wallet.publicKey!.toBase58() };
        if (feeMode === "address") return { kind: "address", value: feeValue };
        const er = await fetch(`${INDEXER_HTTP}/escrow`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform: feeMode, handle: feeValue }),
        });
        const eb = await er.json();
        if (!er.ok) throw new Error(eb.error ?? "escrow creation failed");
        return { kind: feeMode, value: feeValue, escrow: eb.escrowPubkey };
      })();
      const res = await fetch(`${INDEXER_HTTP}/dev/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collectionId: sel.collectionId,
          meta: {
            ticker: `fl${ticker.toUpperCase()}`,
            name,
            image: sel.image,
            links: { ...links, collectiblePage: collectiblePage(sel) },
            feeReceiver,
            launchedBy: wallet.publicKey.toBase58(),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "launch failed");
      onLaunched(body.market);
    } catch (e: any) {
      setError(String(e.message ?? e).slice(0, 140));
    }
    setBusy(false);
  }

  const stepper = (
    <div className="wizard-steps">
      {(
        [
          [1, "Pick a collectible"],
          [2, "Finalise your token"],
          [3, "Review & launch"],
        ] as const
      ).map(([n, label]) => (
        <button
          key={n}
          className={`wizard-step ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}
          onClick={() => n < step && setStep(n)}
        >
          <span className="wizard-num">{step > n ? "✓" : n}</span> {label}
        </button>
      ))}
    </div>
  );

  // ---------- step 1: pick ----------
  if (step === 1) {
    return (
      <div className="launch-shell">
        {stepper}
        <div className="wizard-hero">
          <div className="launch-title">Pick a collectible.</div>
          <div className="dim wizard-sub">
            Launch a new token on top of it. Every listed collectible has a live price feed; your
            token tracks it from block one.
          </div>
        </div>
        <div className="wizard-controls">
          <div className="cat-tabs">
            {CATEGORIES.map((c) => (
              <button key={c} className={`tab-btn ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
                {c} ({(catalog as Underlying[]).filter((u) => u.category === c).length})
              </button>
            ))}
          </div>
          <input
            className="amount-input search-input"
            placeholder="Search cards and collections…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="under-grid">
          {list.map((u) => {
            const launched = live.has(u.market);
            return (
              <button
                key={u.identifier}
                className={`under-tile card ${launched ? "launched" : ""}`}
                onClick={() => (launched ? onLaunched(u.market) : pick(u))}
              >
                {u.image ? (
                  <img src={u.image} alt={u.name} loading="lazy" />
                ) : (
                  <div className="under-noart dim">no art</div>
                )}
                <div className="under-name">{u.name}</div>
                <div className="under-sub dim">{u.kind === "card" ? u.grade : "collection floor"}</div>
                <div className="under-price mono">{priceLabel(u)}</div>
                {launched && <span className="chip chip-ok live-chip">Live · trade</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!sel) {
    return null;
  }

  // ---------- step 2: finalise ----------
  if (step === 2) {
    return (
      <div className="launch-shell">
        {stepper}
        <div className="wizard-hero">
          <div className="launch-title">Finalise your token.</div>
          <div className="dim wizard-sub">Name it, claim a ticker, and optionally add links.</div>
        </div>
        <div className="wizard-body">
          <div className="wizard-anchor card">
            {sel.image && <img className="launch-art" src={sel.image} alt={sel.name} />}
            <div className="launch-under-name">{cleanTitle(sel)}</div>
            <div className="dim launch-under-sub">
              {sel.kind === "card" ? `${sel.grade} · ${sel.category}` : "NFT collection floor"}
            </div>
            <div className="mono launch-under-price">{priceLabel(sel)}</div>
            <button className="back-link" onClick={() => setStep(1)}>← change collectible</button>
          </div>

          <div className="launch-form card">
            <label className="field-label">Token name</label>
            <input
              className="amount-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
            />
            <label className="field-label" style={{ marginTop: 12 }}>Ticker</label>
            <div className="ticker-row">
              <span className="ticker-prefix mono">fl</span>
              <input
                className="amount-input ticker-input mono"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="BIRDS"
              />
            </div>
            <div className={`ticker-check ${tickerState.ok ? "ok" : "bad"}`}>{tickerState.msg}</div>

            <button className="extras-toggle" onClick={() => setShowExtras(!showExtras)}>
              {showExtras ? "▾" : "▸"} Links & creator fees (optional)
            </button>
            {showExtras && (
              <div className="extras-body">
                <div className="form-row2">
                  {(["twitter", "website", "discord", "telegram"] as const).map((k) => (
                    <input
                      key={k}
                      className="amount-input link-input"
                      placeholder={k}
                      value={links[k]}
                      onChange={(e) => setLinks({ ...links, [k]: e.target.value })}
                    />
                  ))}
                </div>
                <label className="field-label">Creator fee receiver</label>
                <div className="fee-modes">
                  {(
                    [
                      ["wallet", "My wallet"],
                      ["address", "Address"],
                      ["x", "X"],
                      ["youtube", "YouTube"],
                      ["elitefourum", "Elite Fourum"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      className={`fee-mode ${feeMode === k ? "active" : ""}`}
                      onClick={() => setFeeMode(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {feeMode !== "wallet" && (
                  <input
                    className="amount-input"
                    placeholder={
                      feeMode === "address"
                        ? "Solana address"
                        : feeMode === "youtube"
                          ? "channel handle (without @)"
                          : feeMode === "elitefourum"
                            ? "forum username"
                            : "@handle"
                    }
                    value={feeValue}
                    onChange={(e) => setFeeValue(e.target.value)}
                  />
                )}
                {["x", "youtube", "elitefourum"].includes(feeMode) && (
                  <div className="dim form-note">
                    Their fee share accrues to a keyless on-chain escrow until they verify
                    ownership and claim. Launch for any creator; they collect when they show up.
                  </div>
                )}
              </div>
            )}

            <button
              className="cta buy wizard-next"
              disabled={!tickerState.ok || !name}
              onClick={() => setStep(3)}
            >
              {tickerState.ok && name ? "Continue" : "Complete the fields to continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- step 3: review & launch ----------
  return (
    <div className="launch-shell">
      {stepper}
      <div className="wizard-hero">
        <div className="launch-title">Review & launch.</div>
        <div className="dim wizard-sub">
          One transaction. The curve opens at the collectible's live price.
        </div>
      </div>
      <div className="wizard-body">
        <div className="wizard-anchor card">
          {sel.image && <img className="launch-art" src={sel.image} alt={sel.name} />}
          <div className="launch-under-name">{cleanTitle(sel)}</div>
          <div className="mono launch-under-price">{priceLabel(sel)}</div>
          <a className="derived-link" href={collectiblePage(sel)} target="_blank" rel="noreferrer">
            View on {sel.kind === "nft" ? "Magic Eden" : "Collector Crypt"} ↗
          </a>
        </div>
        <div className="launch-form card">
          <div className="params-preview">
            <div className="row"><span>Token</span><span className="mono">{name}</span></div>
            <div className="row"><span>Ticker</span><span className="mono">fl{ticker.toUpperCase()}</span></div>
            <div className="row"><span>Anchored to</span><span className="mono">{sel.kind === "card" ? "graded card price" : "collection floor"}</span></div>
            <div className="row"><span>Trading fee</span><span className="mono">0.70% per swap</span></div>
            <div className="row"><span>Creator fee share</span><span className="mono">
              {feeMode === "wallet" ? "your wallet" : feeMode === "address" ? "custom address" : `${feeMode}: ${feeValue || "?"}`}
            </span></div>
            <div className="row"><span>Graduation</span><span className="mono">10 SOL raised</span></div>
            <div className="row"><span>Launch price</span><span className="mono">at the live index</span></div>
            <div className="row"><span>Hedge reserve</span><span className="mono">100M tokens</span></div>
          </div>
          {wallet.connected ? (
            <button className="cta buy wizard-next" onClick={launch} disabled={busy}>
              {busy ? "Launching…" : `Launch fl${ticker.toUpperCase()}`}
            </button>
          ) : (
            <button className="cta buy wizard-next" onClick={wallet.connect}>Connect wallet</button>
          )}
          {error && <div className="tx-note err">{error}</div>}
          <button className="back-link" onClick={() => setStep(2)}>← back</button>
        </div>
      </div>
    </div>
  );
}
