# commas - Tweet Context Master

Everything needed to write tweets about **commas**. Facts are verified against
mainnet and the repo as of 2026-08-02. Use this as the single source; pull a
section, pick an angle, keep the voice rules.

---

## 0. VOICE & HARD RULES (read first)

- **Never use em dashes (—).** Ever. Use a period, comma, or " - " (hyphen with
  spaces). This is a hard brand rule.
- **"commas" is lowercase.** Brand is `commas`, domain `commas.art`, handle
  `@commasdotart`.
- **Be honest about the soft peg.** commas is a *funding-pegged synthetic*, not a
  hard peg. Never imply exact/guaranteed 1:1 index tracking. "tethered," "tracks,"
  "pulled toward" are fine. "pegged 1:1," "redeem for full value anytime" are not.
- **The commas token is NOT live yet.** It will launch on pump.fun; the official
  CA will only ever be posted by @commasdotart. Never invent or imply a contract
  address. Do not fake urgency around a token that doesn't exist.
- **Solana only.**
- Confident, plain, a little contrarian. No hype-emoji soup. Let the mechanism be
  the flex. Short sentences.
- Don't overclaim decentralization: v1 launches are admin-gated; the admin can
  freeze markets and set params at init (params are immutable after).

---

## 1. THE ONE-LINER (positioning, several registers)

- **Plain:** commas is a Solana launchpad for tokens that track the price of real
  collectibles: graded trading cards and NFT floors. No vault, no custody.
- **Punchy:** Trade Charizard's price like a memecoin. No card, no vault, no
  middleman holding your stuff.
- **Thesis:** Price exposure to graded cards and NFT floors, on chain, without
  anyone custodying the physical item. A synthetic that references the price
  instead of holding the thing.
- **For traders:** Long or short any blue-chip collectible's floor in SOL, on a
  bonding curve that graduates to an AMM. Liquid exposure to illiquid assets.
- **For collectors:** Hedge the card or NFT you already own without selling it.

commas turns a collectible's *price* into a liquid Solana market, and leaves the
physical item exactly where it is.

---

## 2. HARD FACTS (verified on mainnet, 2026-08-02)

| Fact | Value |
| --- | --- |
| Status | **LIVE on Solana mainnet** |
| Program ID | `QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM` |
| Global config | `3HmyakKbiYHBKjXUpmZWffBiLzQ2f3ZwR22HAHucTz2t` |
| Program Solscan | solscan.io/account/QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM |
| Test suite | 21 integration tests passing + adversarial review pass |
| Chain | Solana only (Anchor program) |
| Site | commas.art |
| Launch app | launch.commas.art |
| Docs | (Mintlify docs site) |
| X / Twitter | @commasdotart (x.com/commasdotart) |
| commas token | NOT launched yet; will be on pump.fun, CA only via @commasdotart |

Audit: independent audit is on the roadmap (not yet done). Say "21-test suite +
adversarial review," not "audited."

---

## 3. WHAT YOU'RE TRADING (the core concept)

- Every commas market is **one token priced against one collectible**, never
  against SOL or a dollar.
- **1,000,000 tokens = 1 unit of the collectible** (one PSA 10 card, or one floor
  NFT). Each token is one-millionth of that item's price.
- Example: PSA 10 Umbreon VMAX ~ $2,100 in real life -> one full unit of tokens is
  ~$2,100 of exposure, each token ~$0.0021. Card doubles, your exposure doubles.
  Card drops 30%, so does your token. Two-way price exposure, not a bet that only
  pays up.
- **SOL is only the currency you trade with** and the collateral hedgers post. It
  is never the thing being tracked.
- No grading, storing, shipping, or insuring a card. You hold price exposure.

---

## 4. THE UNDERLYINGS (what you can trade)

- **Flagship asset class: graded trading cards** (Pokemon, One Piece, Yu-Gi-Oh!,
  Magic: The Gathering), by exact card + grade (e.g. "2024 #043 Monkey D. Luffy
  PSA 10"). Card grades: PSA, CGC, Beckett (BGS).
- **Secondary: NFT collection floors** (Mad Lads, Froganas, Famous Fox, Claynosaurz,
  Okay Bears, Tensorians, SMB, Aurory, and more).
- **Catalog today: 68 underlyings** = 57 card entries + 11 NFT collections.
- **Real on-chain backing depth (cards):** commas maps its card underlyings to
  **Collector Crypt** ($CARDS) vaulted-card NFTs on Solana. 44 of the card
  underlyings have live on-chain vaulted copies, **1,135 vaulted graded copies**
  total across them (some cards have 100+ physical copies vaulted, e.g. one Luffy
  promo has 260).
- **Holdings view:** commas can show whether a wallet holds the *real* backing
  collectible (via Collector Crypt's on-chain collection for cards, and each NFT
  collection's verified on-chain collection). Live API: `/holdings/:owner`.
- Card price sources: eBay sold + TCGplayer aggregates, cross-checked vs tokenized
  venues (Collector Crypt, Courtyard), USD -> SOL via Pyth. NFT floors: Tensor +
  Magic Eden bids and sale TWAPs.

---

## 5. HOW A MARKET WORKS (lifecycle, tweet-thread ready)

1. **Listing.** One market per collectible. Full token supply is preminted (curve
   allocation + hedge reserve + item reserve) and **the mint authority is revoked
   in the same transaction** (wallets show "mint revoked"). Admin-gated in v1;
   listing criteria = depth, sale frequency, population.
2. **Index goes live.** A signed relayer reads the collectible's real price off
   marketplaces, filters manipulation, and pushes it on chain as an EMA-smoothed,
   rate-limited, circuit-broken index.
3. **Bonding curve launch.** pump.fun-style constant-product curve. Every launch is
   identical: **1B supply, opens at 25 SOL market cap, graduates once the curve
   raises 100 SOL** (~625 SOL market cap at close). Curve fee 0.70%.
4. **Graduation (automatic).** At 100 SOL raised, `graduate` auto-cranks: the full
   raise seeds an internal constant-product **AMM**, unsold curve tokens **burn**
   (supply only shrinks), status flips to Live.
5. **Live phase, five things run:** AMM trading, CDP shorts, funding, liquidations,
   item swaps (the card/NFT door).

---

## 6. THE MECHANICS (each is a tweet)

- **Two-sided tether (soft peg).** Above index: draw synth at index, sell at the
  higher mark -> new supply pushes price down, funding pays shorts. Below index:
  buy back cheap and repay for profit -> buy pressure, funding charges shorts to do
  it. Price oscillates in a basis band around the index. No redemption pot to
  drain. Softness is the price of having no vault.
- **CDP shorts / hedging.** Post SOL collateral, draw synth at the index value,
  sell it. Min **150% collateral to open, 120% maintenance**. Close by buying back
  and repaying. **Collectors are the natural shorts:** you hedge the card/NFT you
  own, lock in the SOL price, without selling the physical or losing community
  status.
- **Funding.** Permissionless crank compares mark EMA to index TWAP, accrues a
  *clamped* daily funding rate to short debt. Rich side pays the cheap side.
- **Liquidations.** Below 120% CR, any liquidator repays the debt from their wallet
  and takes the collateral + **5% bonus**; insurance fund covers shortfalls.
- **Insurance fund.** Per-market backstop for liquidation shortfalls.
- **Item swaps (the two-way door, feeless).** Deposit a registered vaulted copy ->
  get tokens worth exactly one copy at current price. Return that token value ->
  take a copy out of escrow (first-come while escrow holds copies). No fixed rate,
  no redemption queue. The collectible's own supply becomes market liquidity.
- **Circuit breaker.** An oracle print deviating >30% from the TWAP freezes the
  market instead of moving it. Frozen = trading/shorts/funding/liquidations paused,
  adding collateral still allowed. Admin reviews and unfreezes.
- **Staleness guard.** If the feed dies, past a max age the market rejects new
  shorts/funding/liquidations (degrades to safe mode) instead of trusting a stale
  price. Trading and repaying still work.
- **Identity escrows.** A launch can name its fee receiver by social handle (an X
  handle, a YouTube channel); fees accrue in a keyless PDA nobody can spend until
  the creator verifies. Nice "launch a market for a community figure" angle.

---

## 7. ECONOMICS / NUMBERS (tweet-ready figures)

- Supply: **1,000,000,000 (1B)** per market, fixed, mint revoked, only shrinks.
- Curve: opens **25 SOL market cap**, virtual reserves 25 SOL / 1B tokens.
- Graduation at **100 SOL raised**; closes ~**625 SOL market cap**; full raise
  seeds the AMM.
- Curve MC checkpoints: 0 -> 25, 50 SOL raised -> 225, 100 SOL raised -> 625 SOL.
- Price per unit walks 0.025 -> 0.625 SOL over the raise (25x); early buys front-
  load discovery (first SOL buys ~20x the tokens of the last SOL).
- AMM depth: at the 100 SOL opening pool, a 1 SOL buy moves price ~+2%, 5 SOL
  ~+10%, 10 SOL ~+21%. Impact halves as the pool doubles.
- **Fees: 0.70% (70 bps) on SOL trades**, split 50% to the market's fee receiver /
  50% protocol. **Item swaps pay 0 fee, deliberately.** Launch fee: **0.1 SOL
  flat**. Per 1,000 SOL volume -> 7 SOL fees (3.5 creator / 3.5 protocol).
- Collateral: 150% initial / 120% maintenance / 5% liquidation bonus.

**Transmission (the killer idea):** when the token trades above the collectible's
price, arbitrageurs buy the *cheapest real floor copies* to deposit for tokens,
which locks copies out of float and pushes the real floor UP. Upside transmission
into the real item is limited only by marketplace float; downside is hard-capped
by escrow inventory. The pool converts token volatility into a *ratchet on the
collectible's float*.

---

## 8. WHY IT'S DIFFERENT (differentiators / contrarian angles)

- **No vault, no custody.** Unlike fractionalized NFTs / 404 hybrids, commas never
  holds the physical item. That kills adverse selection, the lemons problem,
  custody honeypots, and reflexive vault unwinds. The tradeoff it accepts: a
  *softer* peg. Honest tradeoff, stated openly.
- **You can't rug what nobody custodies.** No pooled third-party money sitting
  behind an oracle-priced redemption, so a manipulated print can't drain a pot.
- **Rug-resistant by construction:** mint authority revoked at creation; curve
  params immutable after launch; unsold supply burns; every vault is a keyless PDA
  no human can sign for. Oracle damage is bounded (clamp + breaker).
- **Real backing exists for cards** (Collector Crypt vaulted NFTs), even though
  solvency doesn't depend on it - and commas can prove on-chain whether you hold
  the real thing.
- **Every market has a natural short:** the collector who already owns the asset.
  Most synthetics beg for shorts; collectibles come with them.
- **Liquid exposure to illiquid assets.** Graded cards and NFT floors are slow,
  chunky, high-friction markets. commas makes them tradeable in SOL, 24/7.

---

## 9. ANTI-RUG / SAFETY STORY (its own thread)

- Mint authority revoked in the creation tx -> no stealth mints, ever. Supply only
  shrinks (unsold curve tokens burn at graduation).
- Curve parameters immutable after creation; the program rejects changes.
- Every treasury/vault/pool is a program-derived address (PDA) with **no private
  key anywhere** - not the team, not the admin, not a server.
- Oracle manipulation is bounded: only tilts clamped funding + draw/repay pricing;
  a big deviation freezes the market (circuit breaker). No redemption pot.
- Staleness guard degrades to safe mode if the feed dies.
- Migration requires the full 100 SOL raise, and all of it seeds the pool (no thin
  fake liquidity).
- 21-test integration suite + adversarial review. Independent audit on the roadmap.

---

## 10. WHO IT'S FOR

- **Longs / traders:** liquid, leverage-free floor exposure to blue-chip cards and
  NFTs, in SOL, on a familiar curve->AMM shape.
- **Shorts / hedgers (the collectors):** lock in your card/NFT's SOL price without
  selling it, losing status, or triggering a sale. Get paid funding when the token
  trades rich.
- **Liquidators / crankers:** permissionless funding cranks, graduation cranks, and
  liquidations with a 5% bonus.
- **Community figures:** launch a market with fees routed to a social identity
  escrow.

---

## 11. READY-MADE TWEET ANGLES (seed lines, adapt the voice)

- "You can now trade the price of a PSA 10 Charizard on Solana. No card. No vault.
  Just the price."
- "Every collectible market needs a short. Collectibles come with one: the person
  who already owns the card."
- "We didn't build a vault. You can't drain a vault that doesn't exist."
- "1,000,000 tokens = one card. The card moves, your token moves. Both directions."
- "Graded cards are the slowest market in collectibles. We made them trade like a
  memecoin."
- "Mint revoked at launch. Params frozen. Unsold supply burns. Every vault keyless.
  There's nothing to rug."
- "Hold the card, hedge the card, never sell the card."
- "The token trades above the card's price -> arbitrage buys real floor copies to
  feed the pool -> the real floor goes up. The market is a ratchet on the float."
- "Fractional NFTs custody the thing and pray. commas references the price and
  holds nothing."
- "commas is live on Solana mainnet. 21 tests, adversarial review, zero vault."
- Stat drop: "68 collectible markets ready. 1,135 graded cards vaulted on-chain
  behind the flagship set."
- "Item swaps cost 0 fee. Trading with SOL costs 0.70%. The real-thing door is
  always the cheapest way in."

---

## 12. OBJECTION HANDLING (from the FAQ, for reply/quote tweets)

- "Is it backed by real cards?" -> Not vault-backed. It's a synthetic: CDP supply
  is backed by shorts' SOL collateral, price tethered by funding + arbitrage. Some
  markets *also* hold real vaulted copies as swap inventory, but solvency never
  depends on custody. That's the point.
- "Can the team mint more?" -> No. Fixed supply, mint revoked at creation, supply
  only shrinks.
- "Why isn't the price exactly the index?" -> Soft peg. Funding + arbitrage pull it
  toward the index within a basis band; they don't nail it. If you need exact
  every-block tracking, this isn't your instrument.
- "What if the oracle is manipulated?" -> Bounded: clamped funding + breaker freeze.
  No pot to drain.
- "Can I redeem for a card?" -> When the market's escrow holds one, yes, value-based
  and first-come. Empty escrow = pure synthetic exposure until someone deposits.
- "How is this different from a 404 / fractional NFT?" -> Those custody + peg by
  redemption (tracker with vault problems). commas references price, holds nothing,
  accepts a softer peg to kill custody entirely.

---

## 13. GLOSSARY (use terms correctly)

- **synth / token:** the per-market SPL token tracking one collectible.
- **index:** on-chain oracle price of one unit of the collectible (launch-scaled).
- **mark (EMA):** the token's smoothed venue price; all tether math uses it, never
  spot (so single-block spikes can't move funding/liquidations).
- **unit:** 1,000,000 tokens = one collectible item.
- **premium / basis:** mark/index - 1.
- **CDP short:** SOL-collateralized minted-synth short (the hedge side).
- **graduation:** curve -> AMM migration at 100 SOL raised.
- **item swap / the door:** feeless two-way exchange of a real vaulted copy for
  tokens.
- **circuit breaker / freeze:** auto-pause on an outlier oracle print.
- Ticker format is `$TICKER` per market (e.g. a Frog market shows `$FROG`).

---

## 14. LINKS & HANDLES (canonical)

- Site: https://commas.art
- Launch app: https://launch.commas.art
- X: https://x.com/commasdotart  (handle @commasdotart)
- Program (Solscan): https://solscan.io/account/QsixfrupxfVEDDYuQsR4vJcE58bbNfctD9WjijM9BjM
- API (live, read-only): https://commas-indexer.fly.dev  (/markets, /listings,
  /holdings/:owner, WebSocket /ws)

---

## 15. DO NOT SAY

- No em dashes. (Repeat, because it will slip.)
- Don't post or imply a commas-token contract address (it isn't launched).
- Don't say "pegged," "fully backed," "redeem anytime for full value," or
  "audited."
- Don't promise price-only-goes-up. It's two-way exposure.
- Don't call it multichain. Solana only.
- Don't overstate decentralization for v1 (admin-gated launches, admin freeze).
