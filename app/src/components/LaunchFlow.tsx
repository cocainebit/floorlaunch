/**
 * Launch wizard, exact long.xyz structure adapted to collectibles:
 *   1 Market        "Select a market" (featured / most liquid / categories)
 *   2 Fee receiver  "Allocate fees to yourself or any creator"
 *   3 Personalise   ticker, name, image, links, description
 *   4 Summary       review cards + ticker availability + deploy
 * Breadcrumb header shows prev/next step names with a progress underline.
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

const STEPS = ["Intro", "Market", "Fee receiver", "Personalise", "Summary"] as const;
const CATS = ["Pokemon", "One Piece", "NFT collections"] as const;
const RESERVED = new Set(["SOL", "USDC", "BTC", "ETH", "FL", "FLOOR"]);

const all = catalog as Underlying[];
const byLiquidity = [...all].sort((a, b) => {
  const va = a.kind === "nft" ? a.snapshot.weeklyVolSol ?? 0 : (a.snapshot.ccListings ?? 0) * 100;
  const vb = b.kind === "nft" ? b.snapshot.weeklyVolSol ?? 0 : (b.snapshot.ccListings ?? 0) * 100;
  return vb - va;
});
const FEATURED = byLiquidity.slice(0, 2);
const MOST_LIQUID = byLiquidity.slice(2, 10);

function tickerFrom(u: Underlying): string {
  const stop = new Set(["the", "of", "and", "full", "art", "ex", "gx", "v", "vmax", "psa"]);
  const words = u.name.split(/[^a-zA-Z]+/).filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  return (words.find((x) => /^[A-Z]/.test(x)) ?? words[0] ?? "TOKEN").toUpperCase().slice(0, 8);
}
function cleanTitle(u: Underlying): string {
  if (u.kind !== "card") return `${u.name} Floor`;
  const m = u.name.match(/#\S+\s+(.*?)\s+(?:PSA|CGC|BGS)\b/i);
  return `${(m ? m[1] : u.name).replace(/Full Art\//i, "").trim()} ${u.grade}`;
}
const subLabel = (u: Underlying) =>
  u.kind === "card" ? cleanTitle(u).replace(/ PSA.*| CGC.*/, "") : u.name;
const priceOf = (u: Underlying) =>
  u.kind === "nft"
    ? `${u.snapshot.floorSol} SOL floor`
    : `$${(u.usdPrice ?? u.snapshot.ccFloorUsd).toLocaleString()}`;

function AssetRow({
  u,
  selected,
  isNew,
  onClick,
}: {
  u: Underlying;
  selected: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`lz-asset ${selected ? "sel" : ""}`} onClick={onClick}>
      {u.image ? (
        <img src={u.image} alt="" className="lz-asset-img" />
      ) : (
        <div className="lz-asset-img lz-noart" />
      )}
      <div className="lz-asset-text">
        <div className="lz-asset-ticker">{tickerFrom(u)}</div>
        <div className="lz-asset-name">{subLabel(u).slice(0, 26)}</div>
      </div>
      {isNew && <span className="lz-new">NEW</span>}
      {selected && <span className="lz-check">✓</span>}
    </button>
  );
}

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
  const [step, setStep] = useState(1); // index into STEPS: 1..4 active screens
  const [cat, setCat] = useState<(typeof CATS)[number]>("Pokemon");
  const [sel, setSel] = useState<Underlying | null>(null);

  const [feeMode, setFeeMode] = useState<"me" | "address" | "x" | "youtube" | "elitefourum">("me");
  const [feeValue, setFeeValue] = useState("");

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [social, setSocial] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takenTickers = useMemo(
    () => new Set(Object.values(listings).map((l) => l.ticker.replace(/^fl/, "").toUpperCase())),
    [listings]
  );
  const tickerState = useMemo(() => {
    if (!ticker) return { ok: false, msg: "Ticker is required" };
    if (!/^[A-Za-z]+$/.test(ticker)) return { ok: false, msg: "Ticker must contain only letters" };
    if (ticker.length > 8) return { ok: false, msg: "Ticker must be 8 characters or less" };
    const t = ticker.toUpperCase();
    if (RESERVED.has(t) || takenTickers.has(t))
      return { ok: false, msg: "Reserved. Try another ticker." };
    return { ok: true, msg: "Available" };
  }, [ticker, takenTickers]);

  const feeLabel =
    feeMode === "me"
      ? `Me ${wallet.publicKey ? wallet.publicKey.toBase58().slice(0, 6) + "..." + wallet.publicKey.toBase58().slice(-4) : "(connect wallet)"}`
      : feeMode === "address"
        ? `Address ${feeValue.slice(0, 6)}...`
        : `${feeMode === "x" ? "X" : feeMode === "youtube" ? "YouTube" : "Elite Fourum"} @${feeValue.replace(/^@/, "")}`;

  function pick(u: Underlying) {
    if (live.has(u.market)) {
      onLaunched(u.market);
      return;
    }
    setSel(u);
    if (!ticker) setTicker(tickerFrom(u));
    if (!name) setName(cleanTitle(u));
  }

  async function deploy() {
    if (!sel || !wallet.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const feeReceiver = await (async () => {
        if (feeMode === "me") return { kind: "wallet", value: wallet.publicKey!.toBase58() };
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
            image: imageUrl || sel.image,
            links: { social, description },
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

  const canNext =
    step === 1 ? !!sel : step === 2 ? feeMode === "me" || !!feeValue : step === 3 ? tickerState.ok && !!name : true;

  const header = (
    <div className="lz-nav">
      <button
        className="lz-nav-side"
        onClick={() => step > 1 && setStep(step - 1)}
        style={{ visibility: step >= 1 ? "visible" : "hidden" }}
      >
        <span className="lz-chev">‹</span> {STEPS[step - 1]}
      </button>
      <button
        className="lz-nav-side lz-nav-next"
        onClick={() => canNext && step < 4 && setStep(step + 1)}
        style={{ visibility: step < 4 ? "visible" : "hidden" }}
      >
        {STEPS[step + 1]} <span className="lz-chev">›</span>
      </button>
      <div className="lz-progress">
        <div className="lz-progress-fill" style={{ width: `${(step / 4) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="lz-shell">
      <div className="lz-col">
        {header}

        {step === 1 && (
          <>
            <div className="lz-title">Select a market</div>
            <div className="lz-sub">Choose the collectible that anchors your floorlaunch token</div>

            <div className="lz-section">FEATURED</div>
            <div className="lz-grid2">
              {FEATURED.map((u) => (
                <AssetRow key={u.identifier} u={u} selected={sel?.identifier === u.identifier} onClick={() => pick(u)} />
              ))}
            </div>

            <div className="lz-section">MOST LIQUID</div>
            <div className="lz-grid2">
              {MOST_LIQUID.map((u) => (
                <AssetRow key={u.identifier} u={u} selected={sel?.identifier === u.identifier} onClick={() => pick(u)} />
              ))}
            </div>

            <div className="lz-section">COLLECTIBLES</div>
            <div className="lz-pills">
              {CATS.map((c) => (
                <button key={c} className={`lz-pill ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="lz-grid2">
              {all
                .filter((u) => u.category === cat)
                .map((u, i) => (
                  <AssetRow
                    key={u.identifier}
                    u={u}
                    selected={sel?.identifier === u.identifier}
                    isNew={i < 2}
                    onClick={() => pick(u)}
                  />
                ))}
            </div>
            <div className="lz-spacer" />
            <button className="lz-cta" disabled={!sel} onClick={() => setStep(2)}>
              CONTINUE
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="lz-title">Fee receiver</div>
            <div className="lz-sub">Allocate fees to yourself or any creator</div>
            <div className="lz-bigspace" />
            <div className="lz-segments">
              {(
                [
                  ["me", "Me"],
                  ["address", "Address"],
                  ["x", "X account"],
                  ["youtube", "YouTube"],
                  ["elitefourum", "Elite Fourum"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={`lz-segment ${feeMode === k ? "active" : ""}`}
                  onClick={() => setFeeMode(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {feeMode === "me" ? (
              <div className="lz-fee-card">
                <div>
                  <div className="lz-fee-title">Me</div>
                  <div className="lz-fee-sub">
                    {wallet.publicKey
                      ? `${wallet.publicKey.toBase58().slice(0, 6)}...${wallet.publicKey.toBase58().slice(-4)}`
                      : "no wallet connected"}
                  </div>
                </div>
                <span className="lz-chip">Connected wallet</span>
              </div>
            ) : (
              <div className="lz-fee-card lz-fee-input-card">
                <input
                  className="lz-input lz-fee-input"
                  placeholder={
                    feeMode === "address"
                      ? "Solana address"
                      : feeMode === "youtube"
                        ? "channel handle"
                        : feeMode === "elitefourum"
                          ? "forum username"
                          : "@handle"
                  }
                  value={feeValue}
                  onChange={(e) => setFeeValue(e.target.value)}
                />
                {feeMode !== "address" && (
                  <span className="lz-chip lz-chip-dim">escrow until verified</span>
                )}
              </div>
            )}
            <div className="lz-spacer" />
            <button className="lz-cta" disabled={!canNext} onClick={() => setStep(3)}>
              CONTINUE
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="lz-title">Personalise</div>
            <div className="lz-sub">Add a ticker, name, image and links</div>
            <div className="lz-bigspace" />
            <div className="lz-field">
              <label>Ticker</label>
              <div className="lz-ticker-wrap">
                <span className="lz-ticker-fl">fl</span>
                <input
                  className="lz-input lz-ticker"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  maxLength={8}
                />
              </div>
              {ticker && (
                <div className={`lz-hint ${tickerState.ok ? "ok" : "bad"}`}>{tickerState.msg}</div>
              )}
            </div>
            <div className="lz-field">
              <label>Name</label>
              <input className="lz-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} />
            </div>
            <div className="lz-field">
              <label>Image</label>
              <input
                className="lz-input"
                placeholder={sel?.image ? "Card art (default) — or paste an image URL" : "Paste an image URL"}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            <div className="lz-field">
              <label>
                Social Links <span className="lz-opt">(optional)</span>
              </label>
              <input
                className="lz-input"
                placeholder="↗ Paste link — X, website..."
                value={social}
                onChange={(e) => setSocial(e.target.value)}
              />
            </div>
            <div className="lz-field">
              <label>
                Description <span className="lz-opt">(optional)</span>
              </label>
              <textarea
                className="lz-input lz-textarea"
                value={description}
                maxLength={100}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="lz-counter">{description.length}/100</div>
            </div>
            <div className="lz-spacer" />
            <button className="lz-cta" disabled={!canNext} onClick={() => setStep(4)}>
              FINALISE YOUR TOKEN
            </button>
          </>
        )}

        {step === 4 && sel && (
          <>
            <div className="lz-title">Summary</div>
            <div className="lz-sub">Review your floorlaunch launch</div>
            <div className="lz-bigspace" />

            <div className="lz-review-label">Your asset:</div>
            <div className="lz-review-card">
              {(imageUrl || sel.image) && <img className="lz-review-img" src={imageUrl || sel.image!} alt="" />}
              <div className="lz-review-text">
                <div className="lz-review-main">$fl{ticker.toUpperCase()}</div>
                <div className="lz-review-line">{name}</div>
                {description && <div className="lz-review-line lz-dim">{description}</div>}
              </div>
              <button className="lz-edit" onClick={() => setStep(3)}>✎</button>
            </div>

            <div className="lz-review-label">Anchored to:</div>
            <div className="lz-review-card">
              {sel.image && <img className="lz-review-img lz-review-art" src={sel.image} alt="" />}
              <div className="lz-review-text">
                <div className="lz-review-main">{cleanTitle(sel)}</div>
                <div className="lz-review-line">
                  {sel.kind === "card" ? `${sel.category} · ${priceOf(sel)}` : `NFT floor · ${priceOf(sel)}`}
                </div>
              </div>
              <button className="lz-edit" onClick={() => setStep(1)}>✎</button>
            </div>

            <div className="lz-review-label">Fee receiver</div>
            <div className="lz-review-card lz-review-thin">
              <div className="lz-review-line">
                <b>{feeLabel}</b>
              </div>
              <button className="lz-edit" onClick={() => setStep(2)}>✎</button>
            </div>

            <div className="lz-review-label">Ticker availability</div>
            <div className={`lz-avail ${tickerState.ok ? "ok" : "bad"}`}>
              {tickerState.ok ? `$fl${ticker.toUpperCase()} is available.` : tickerState.msg}
            </div>

            <div className="lz-spacer" />
            {wallet.connected ? (
              <button className="lz-cta" disabled={busy || !tickerState.ok} onClick={deploy}>
                {busy ? "DEPLOYING…" : "DEPLOY"}
              </button>
            ) : (
              <button className="lz-cta" onClick={wallet.connect}>
                CONNECT WALLET
              </button>
            )}
            {error && <div className="lz-hint bad" style={{ marginTop: 10 }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
