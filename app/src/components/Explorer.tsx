/**
 * The floorlaunch explorer. Search any CA (token mint), market address, or
 * ticker; the result shows the token AND the collectible it is paired
 * with, which is the part no generic explorer can do.
 */
import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import catalog from "../underlyings.json";
import { pdas } from "../tx";
import { RPC_URL } from "../wallet";
import {
  fetchTrades,
  type MarketInfo,
  type ListingMeta,
  type Trade,
} from "../api";

const PER_UNIT = 1_000_000;

interface Holder {
  address: string;
  amount: number;
  label: string | null;
}

const short = (a: string) => `${a.slice(0, 6)}..${a.slice(-6)}`;

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copyable mono"
      title={`${value} (click to copy)`}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span className="dim">{label}</span> {short(value)} {copied ? "✓" : "⧉"}
    </button>
  );
}

export default function Explorer({
  markets,
  listings,
  onTrade,
}: {
  markets: MarketInfo[];
  listings: Record<string, ListingMeta>;
  onTrade: (market: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MarketInfo | null>(null);
  const [supply, setSupply] = useState<number | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return markets.filter((m) => {
      const l = listings[m.market];
      const u = (catalog as any[]).find(
        (c) => c.identifier === l?.identifier || c.collectionId === m.collection
      );
      return (
        m.synthMint.toLowerCase() === q ||
        m.market.toLowerCase() === q ||
        l?.ticker?.toLowerCase().includes(q) ||
        l?.name?.toLowerCase().includes(q) ||
        u?.name?.toLowerCase().includes(q)
      );
    });
  }, [query, markets, listings]);

  // Auto-select an exact address hit or a single match.
  useEffect(() => {
    if (matches.length === 1) setSelected(matches[0]);
  }, [matches]);

  useEffect(() => {
    if (!selected) return;
    const conn = new Connection(RPC_URL, "confirmed");
    const mkt = new PublicKey(selected.market);
    const p = pdas(mkt);
    (async () => {
      try {
        const s = await conn.getTokenSupply(new PublicKey(selected.synthMint));
        setSupply(Number(s.value.amount) / 1e6);
      } catch {
        setSupply(null);
      }
      try {
        const largest = await conn.getTokenLargestAccounts(
          new PublicKey(selected.synthMint)
        );
        const labels: Record<string, string> = {};
        try {
          const [poolAta, treasAta] = [p.pool.toBase58(), p.treasury.toBase58()];
          labels[poolAta] = selected.status === "live" ? "AMM pool" : "launch curve";
          labels[treasAta] = "hedge reserve";
        } catch {}
        setHolders(
          largest.value.slice(0, 8).map((h) => ({
            address: h.address.toBase58(),
            amount: Number(h.amount) / 1e6,
            label: labels[h.address.toBase58()] ?? null,
          }))
        );
      } catch {
        setHolders([]);
      }
      fetchTrades(selected.market, 12).then(setTrades).catch(() => {});
    })();
  }, [selected?.market]);

  const l = selected ? listings[selected.market] : undefined;
  const u = selected
    ? (catalog as any[]).find(
        (c) => c.identifier === l?.identifier || c.collectionId === selected.collection
      )
    : undefined;

  const indexUnit = selected ? selected.indexPerToken * PER_UNIT : 0;
  // Live markets price off the mark EMA; curve-phase markets have no mark
  // until trades happen, so quote the curve's spot instead.
  const markUnit = selected
    ? (selected.markPerToken > 0
        ? selected.markPerToken * PER_UNIT
        : selected.curveVirtualTokens > 0
          ? (selected.curveVirtualSol / selected.curveVirtualTokens) * PER_UNIT
          : 0)
    : 0;
  const premium =
    indexUnit > 0 && markUnit > 0 ? ((markUnit - indexUnit) / indexUnit) * 100 : null;

  return (
    <div className="launch-shell">
      <div className="launch-head">
        <div>
          <div className="launch-title">Explorer</div>
          <div className="dim">
            Search a token CA, market address, or ticker. Every result shows the
            collectible the token is paired with.
          </div>
        </div>
        <input
          className="amount-input search-input explorer-search"
          placeholder="CA, market address, or ticker…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
      </div>

      {!selected && matches.length > 1 && (
        <div className="explorer-matches">
          {matches.map((m) => (
            <button key={m.market} className="card match-row" onClick={() => setSelected(m)}>
              <span className="mono">{listings[m.market]?.ticker ?? "fl???"}</span>
              <span>{listings[m.market]?.name ?? m.market.slice(0, 12)}</span>
              <span className="dim mono">{short(m.synthMint)}</span>
            </button>
          ))}
        </div>
      )}
      {!selected && query && matches.length === 0 && (
        <div className="empty-state">No floorlaunch market matches that query.</div>
      )}
      {!selected && !query && (
        <div className="explorer-matches">
          {markets.map((m) => (
            <button key={m.market} className="card match-row" onClick={() => setSelected(m)}>
              <span className="mono">{listings[m.market]?.ticker ?? "fl???"}</span>
              <span>{listings[m.market]?.name ?? m.market.slice(0, 12)}</span>
              <span className="dim mono">{short(m.synthMint)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="explorer-result">
          <div className="explorer-main">
            <div className="card explorer-header">
              <div className="u-left">
                {(l?.image ?? u?.image) && (
                  <img className="explorer-token-img" src={l?.image ?? u?.image} alt="" />
                )}
                <div>
                  <div className="u-name">
                    {l?.name ?? u?.name ?? "Unknown"}{" "}
                    <span className="ticker">{l?.ticker ?? ""}</span>
                  </div>
                  <div className="explorer-addrs">
                    <Copyable label="CA" value={selected.synthMint} />
                    <Copyable label="market" value={selected.market} />
                  </div>
                </div>
              </div>
              <div className="u-stats">
                <div className="u-stat">
                  <div className="u-label">Status</div>
                  <div className="u-value">
                    <span className={`chip ${selected.frozen ? "chip-warn" : "chip-ok"}`}>
                      {selected.frozen ? "Frozen" : selected.status === "live" ? "Live" : "Curve"}
                    </span>
                  </div>
                </div>
                <div className="u-stat">
                  <div className="u-label">Supply</div>
                  <div className="u-value">
                    {supply != null ? supply.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "…"}
                  </div>
                </div>
                <div className="u-stat">
                  <div className="u-label">Price / unit</div>
                  <div className="u-value">{markUnit ? `${markUnit.toFixed(3)} SOL` : "–"}</div>
                </div>
                <div className="u-stat">
                  <div className="u-label">Premium</div>
                  <div className={`u-value ${(premium ?? 0) >= 0 ? "up" : "down"}`}>
                    {premium === null ? "–" : `${premium >= 0 ? "+" : ""}${premium.toFixed(2)}%`}
                  </div>
                </div>
              </div>
            </div>

            <div className="card explorer-pool">
              <div className="panel-title">Pool</div>
              <div className="stats-grid">
                {selected.status === "live" ? (
                  <>
                    <div className="stat-row">
                      <span className="dim">AMM reserves</span>
                      <span className="mono">
                        {selected.ammSolReserve.toFixed(2)} SOL /{" "}
                        {selected.ammTokenReserve.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="stat-row">
                    <span className="dim">Launch curve</span>
                    <span className="mono">
                      {selected.curveSolRaised.toFixed(2)} / {selected.graduationTargetSol.toFixed(0)} SOL raised
                    </span>
                  </div>
                )}
                <div className="stat-row">
                  <span className="dim">Insurance fund</span>
                  <span className="mono">{selected.insuranceSol.toFixed(3)} SOL</span>
                </div>
                <div className="stat-row">
                  <span className="dim">Hedge collateral</span>
                  <span className="mono">{selected.totalCollateralSol.toFixed(3)} SOL</span>
                </div>
                <div className="stat-row">
                  <span className="dim">Hedge reserve cap</span>
                  <span className="mono">
                    {selected.maxOpenInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens
                  </span>
                </div>
              </div>
            </div>

            <div className="card explorer-holders">
              <div className="panel-title">Top holders</div>
              <div className="stats-grid">
                {holders.map((h) => (
                  <div className="stat-row" key={h.address}>
                    <span className={h.label ? "" : "dim"}>
                      {h.label ?? short(h.address)}
                      {h.label && <span className="chip chip-dim holder-chip">{short(h.address)}</span>}
                    </span>
                    <span className="mono">
                      {h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      {supply ? ` (${((h.amount / supply) * 100).toFixed(1)}%)` : ""}
                    </span>
                  </div>
                ))}
                {holders.length === 0 && <div className="dim">loading…</div>}
              </div>
            </div>

            <div className="card explorer-trades">
              <div className="panel-title">Recent trades</div>
              <div className="stats-grid">
                {trades.map((t) => (
                  <div className="stat-row" key={t.sig + t.ts}>
                    <span className={t.side === "buy" ? "up" : "down"}>
                      {t.side === "buy" ? "Buy" : "Sell"}{" "}
                      <span className="dim mono">{short(t.user)}</span>
                    </span>
                    <span className="mono">
                      {(t.priceSol * PER_UNIT).toFixed(3)} · {t.solAmount.toFixed(3)} SOL
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="explorer-side">
            <div className="card collectible-card">
              <div className="panel-title">Paired collectible</div>
              {u?.image && <img className="collectible-art" src={u.image} alt={u?.name} />}
              <div className="launch-under-name">{u?.name ?? "Unknown underlying"}</div>
              <div className="dim launch-under-sub">
                {u?.kind === "card"
                  ? `${u.grade} · ${u.category} · graded card`
                  : "NFT collection floor"}
              </div>
              <div className="stats-grid collectible-stats">
                <div className="stat-row">
                  <span className="dim">Live index</span>
                  <span className="mono index-color">{indexUnit.toFixed(3)} SOL</span>
                </div>
                {u?.kind === "card" && (
                  <div className="stat-row">
                    <span className="dim">Reference price</span>
                    <span className="mono">
                      ${(u.usdPrice ?? u.snapshot?.ccFloorUsd)?.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="stat-row">
                  <span className="dim">Market depth</span>
                  <span className="mono">
                    {u?.kind === "card"
                      ? `${u.snapshot?.ccListings} vaulted`
                      : `${u?.snapshot?.listed ?? "?"} listed`}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="dim">1M tokens</span>
                  <span className="mono">= 1 {u?.kind === "card" ? "card" : "floor NFT"}</span>
                </div>
              </div>
              {u && (
                <a
                  className="derived-link"
                  href={
                    u.kind === "nft"
                      ? `https://magiceden.io/marketplace/${u.symbol}`
                      : `https://collectorcrypt.com/marketplace?search=${encodeURIComponent(u.name.split(/\s+(PSA|CGC)/)[0])}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  View the real {u.kind === "card" ? "card" : "collection"} ↗
                </a>
              )}
              {l?.links &&
                Object.entries(l.links).filter(([k, v]) => v && k !== "collectiblePage").length > 0 && (
                  <div className="social-links">
                    {Object.entries(l.links)
                      .filter(([k, v]) => v && k !== "collectiblePage")
                      .map(([k, v]) => (
                        <a key={k} href={v} target="_blank" rel="noreferrer" className="chip chip-dim">
                          {k}
                        </a>
                      ))}
                  </div>
                )}
            </div>
            <button className="cta buy" onClick={() => onTrade(selected.market)}>
              Trade {l?.ticker ?? "this market"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
