import { fmtUsd, fmtSol } from "../fmt";
import type { MarketInfo, ListingMeta } from "../api";
import { COLLECTION_META, FALLBACK_META } from "../config";

const PER_UNIT = 1_000_000;

export default function UnderlyingStrip({
  m,
  listing,
  lastTradePrice,
}: {
  m: MarketInfo;
  listing?: ListingMeta;
  lastTradePrice?: number | null;
}) {
  const base = COLLECTION_META[m.collection] ?? FALLBACK_META;
  const meta = listing
    ? {
        name: listing.name,
        ticker: listing.ticker,
        image: listing.image ?? base.image,
        underlying: listing.identifier.startsWith("card:") ? "graded card" : "NFT floor",
        venue: listing.identifier.startsWith("card:") ? "price feed" : "Magic Eden",
      }
    : base;
  const indexUnit = m.indexPerToken * PER_UNIT;
  const cardIndex = m.cardIndexSol ?? indexUnit;
  // Pre-trade curve markets have no mark EMA; quote the curve's spot.
  // Price shown = last trade (what the chart and trade tape show); the
  // funding mark EMA stays an internal mechanism number.
  const markUnit =
    lastTradePrice != null && lastTradePrice > 0
      ? lastTradePrice * PER_UNIT
      : m.markPerToken > 0
        ? m.markPerToken * PER_UNIT
        : m.curveVirtualTokens > 0
          ? (m.curveVirtualSol / m.curveVirtualTokens) * PER_UNIT
          : 0;
  // Every launch opens at a 25 SOL market cap and migrates with 100 SOL
  // in the pool; premium (token vs the collectible since launch) only
  // means something once the market is live.
  const premium =
    m.status === "live" && indexUnit > 0 && markUnit > 0
      ? ((markUnit - indexUnit) / indexUnit) * 100
      : null;
  // Feed freshness from the indexer's wall-clock ingestion time; the raw
  // on-chain timestamp lags on localnet where the validator clock drifts.
  const age = m.feedAgeSec ?? Math.floor(Date.now() / 1000 - m.indexLastTs);
  const fresh = age < 120;

  return (
    <div className="card underlying-strip">
      <div className="u-left">
        {meta.image ? (
          <img className="u-img" src={meta.image} alt={meta.name} />
        ) : (
          <div className="u-img u-img-fallback">{meta.ticker.slice(2, 4)}</div>
        )}
        <div>
          <div className="u-name">
            {meta.name} <span className="ticker">{meta.ticker}</span>
          </div>
          <div className="u-sub">
            {meta.underlying} · index from {meta.venue}
          </div>
        </div>
      </div>

      <div className="u-stats">
        <div className="u-stat">
          <div className="u-label">Floor index</div>
          <div className="u-value index-color">
            {m.solUsd > 0 ? `$${(cardIndex * m.solUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${cardIndex.toFixed(3)} SOL`}
            {m.solUsd > 0 && <span className="u-sub-val">{cardIndex.toFixed(3)} SOL</span>}
          </div>
        </div>
        <div className="u-stat">
          <div className="u-label">Price</div>
          <div className="u-value">
            {m.solUsd > 0 ? fmtUsd((markUnit / 1e6) * m.solUsd) : fmtSol(markUnit / 1e6)}
            {m.solUsd > 0 && <span className="u-sub-val">{fmtSol(markUnit / 1e6)}</span>}
          </div>
        </div>
        <div className="u-stat">
          <div className="u-label">Market cap</div>
          <div className="u-value">
            {m.solUsd > 0 ? `$${(markUnit * 1000 * m.solUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}
            <span className="u-sub-val">{(markUnit * 1000).toFixed(1)} SOL</span>
          </div>
        </div>
        <div className="u-stat">
          <div className="u-label">Premium</div>
          <div className={`u-value ${(premium ?? 0) >= 0 ? "up" : "down"}`}>
            {premium === null ? "–" : `${premium >= 0 ? "+" : ""}${premium.toFixed(2)}%`}
          </div>
        </div>
        <div className="u-stat">
          <div className="u-label">Oracle</div>
          <div className="u-value">
            <span className={`dot ${fresh ? "ok" : "stale"}`} />
            {age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`}
          </div>
        </div>
        <div className="u-stat">
          <div className="u-label">Status</div>
          <div className="u-value">
            <span className={`chip ${m.frozen ? "chip-warn" : "chip-ok"}`}>
              {m.frozen ? "Frozen" : m.status === "live" ? "Live" : "Bootstrap"}
            </span>
            <span className="chip chip-dim">{m.venue}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
