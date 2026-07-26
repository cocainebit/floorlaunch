import { useMemo, useState } from "react";
import catalog from "../underlyings.json";
import { useFlWallet } from "../wallet";
import { INDEXER_HTTP } from "../config";

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

/** Suggest a ticker from the underlying name: flZARD from Charizard etc. */
function suggestTicker(u: Underlying): string {
  const stop = new Set(["the", "of", "and", "full", "art", "ex", "gx", "v", "vmax", "psa"]);
  const words = u.name.split(/[^a-zA-Z]+/).filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  const w = (words.find((x) => /^[A-Z]/.test(x)) ?? words[0] ?? "TOKEN").toUpperCase();
  return "fl" + w.slice(0, 6);
}

/** The underlying's canonical community page, derived, never typed. */
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
  onLaunched,
}: {
  live: Set<string>;
  onLaunched: (market: string) => void;
}) {
  const wallet = useFlWallet();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Pokemon");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Underlying | null>(null);

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
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

  function cleanTitle(u: Underlying): string {
    if (u.kind !== "card") return `${u.name} Floor`;
    const m = u.name.match(/#\S+\s+(.*?)\s+(?:PSA|CGC|BGS)\b/i);
    const title = (m ? m[1] : u.name).replace(/Full Art\//i, "").trim();
    return `${title} ${u.grade}`;
  }

  function pick(u: Underlying) {
    setSel(u);
    setTicker(suggestTicker(u));
    setName(cleanTitle(u));
    setError(null);
  }

  async function launch() {
    if (!sel || !wallet.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${INDEXER_HTTP}/dev/launch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collectionId: sel.collectionId,
          meta: {
            ticker,
            name,
            image: sel.image,
            links: { ...links, collectiblePage: collectiblePage(sel) },
            feeReceiver: await (async () => {
              if (feeMode === "wallet") {
                return { kind: "wallet", value: wallet.publicKey!.toBase58() };
              }
              if (feeMode === "address") {
                return { kind: "address", value: feeValue };
              }
              // Identity receiver: fees accrue to a floorlaunch escrow
              // until the handle verifies ownership and claims.
              const er = await fetch(`${INDEXER_HTTP}/escrow`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ platform: feeMode, handle: feeValue }),
              });
              const eb = await er.json();
              if (!er.ok) throw new Error(eb.error ?? "escrow creation failed");
              return { kind: feeMode, value: feeValue, escrow: eb.escrowPubkey };
            })(),
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

  if (sel) {
    return (
      <div className="launch-shell">
        <button className="back-link" onClick={() => setSel(null)}>
          ← All collectibles
        </button>
        <div className="launch-config">
          <div className="launch-preview card">
            {sel.image && <img src={sel.image} alt={sel.name} className="launch-art" />}
            <div className="launch-under-name">{sel.name}</div>
            <div className="dim launch-under-sub">
              {sel.kind === "card" ? `${sel.grade} · ${sel.category}` : "NFT collection floor"}
            </div>
            <div className="mono launch-under-price">{priceLabel(sel)}</div>
            <a className="derived-link" href={collectiblePage(sel)} target="_blank" rel="noreferrer">
              View on {sel.kind === "nft" ? "Magic Eden" : "Collector Crypt"} ↗
            </a>
          </div>

          <div className="launch-form card">
            <div className="panel-title">Launch a market</div>
            <div className="form-row2">
              <div>
                <label className="field-label">Ticker</label>
                <input className="amount-input" value={ticker} onChange={(e) => setTicker(e.target.value)} maxLength={10} />
              </div>
              <div>
                <label className="field-label">Token name</label>
                <input className="amount-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} />
              </div>
            </div>

            <label className="field-label">Links (optional)</label>
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
            <div className="dim form-note">
              The collectible page ({sel.kind === "nft" ? "Magic Eden" : "Collector Crypt"}) is added
              automatically.
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
                Their share of trading fees accrues to a floorlaunch escrow. The owner claims by
                putting a verification code in their public bio
                {feeMode === "youtube" ? " (channel description)" : feeMode === "elitefourum" ? " (profile About Me)" : ""}
                , proving ownership, and linking a wallet. You can launch for any creator; they
                collect whenever they show up.
              </div>
            )}

            <div className="params-preview">
              <div className="row"><span>Trading fee</span><span className="mono">0.70% per swap</span></div>
              <div className="row"><span>Graduation target</span><span className="mono">10 SOL raised</span></div>
              <div className="row"><span>Launch price</span><span className="mono">at the live index</span></div>
              <div className="row"><span>Hedge reserve</span><span className="mono">100M tokens</span></div>
            </div>

            {wallet.connected ? (
              <button className="cta buy" onClick={launch} disabled={busy || !ticker || !name}>
                {busy ? "Launching…" : `Launch ${ticker || "token"}`}
              </button>
            ) : (
              <button className="cta buy" onClick={wallet.connect}>Connect wallet</button>
            )}
            {error && <div className="tx-note err">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="launch-shell">
      <div className="launch-head">
        <div>
          <div className="launch-title">Launch a collectible market</div>
          <div className="dim">
            Pick the underlying. The token launches on a curve at the collectible's live price and
            tracks it from block one.
          </div>
        </div>
        <input
          className="amount-input search-input"
          placeholder="Search cards and collections…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cat-tabs">
        {CATEGORIES.map((c) => (
          <button key={c} className={`tab-btn ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
            {c} ({(catalog as Underlying[]).filter((u) => u.category === c).length})
          </button>
        ))}
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
              <div className="under-sub dim">
                {u.kind === "card" ? u.grade : "collection floor"}
              </div>
              <div className="under-price mono">{priceLabel(u)}</div>
              {launched && <span className="chip chip-ok live-chip">Live · trade</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
