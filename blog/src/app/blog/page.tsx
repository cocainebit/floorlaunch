"use client";

import {
  BarChart2,
  Home,
  type LucideIcon,
  Mail,
  MessageCircle,
  Moon,
  PenLine,
  Search,
  Share2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const ACCENT = "#a3e635";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#0B0D10] text-white selection:bg-lime-400/30 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-transparent z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href="https://commas.art"
            className="p-2 hover:bg-white/5 rounded-full transition-colors flex items-center gap-2"
          >
            <Image
              src="/comma.png"
              alt="commas"
              width={22}
              height={22}
              className="w-[22px] h-[22px] invert"
            />
            <span className="font-bold italic text-lg tracking-tight">
              commas
            </span>
          </Link>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300">
            <Image
              src="/comma.png"
              alt=""
              width={16}
              height={16}
              className="w-4 h-4 invert"
            />
            <span className="font-medium">The Last Supper</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle theme"
            className="p-2 rounded-full hover:bg-white/5 transition-colors text-zinc-300"
          >
            <Moon className="h-5 w-5" />
          </button>
          <Link
            href="https://x.com/commasdotart"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center h-9 px-4 rounded-full text-sm font-medium border border-white/10 text-white hover:bg-white/5 transition-colors"
          >
            Follow
          </Link>
          <Link
            href="https://commas.art"
            className="inline-flex items-center h-9 px-4 rounded-full text-sm font-semibold text-[#0B0D10] transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            Launch a token
          </Link>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 flex-col items-center justify-center gap-2 z-40">
        <SidebarIcon icon={Home} />
        <SidebarIcon icon={Search} />
        <SidebarIcon icon={PenLine} active />
        <SidebarIcon icon={BarChart2} />
        <SidebarIcon icon={Mail} />
      </aside>

      {/* Main Content */}
      <main className="pl-0 md:pl-16 pt-24 pb-4 w-full max-w-[1000px] mx-auto px-4 sm:px-8 md:px-12">
        {/* Hero Image */}
        <div className="w-full aspect-[2/1] bg-[#12151a] rounded-2xl mb-12 relative overflow-hidden shadow-2xl shadow-black/40 group">
          <Image
            src="/panel-i-cover.jpg"
            alt="The Last Supper, Panel I, a commas original 1/1"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Title Block */}
        <div className="mb-12 max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl lg:text-4xl font-bold mb-4 tracking-tight leading-[1.1]">
            The Last Supper, Panel I: a token that owns a price
          </h1>
          <p className="text-xl text-zinc-400 font-light">
            Every commas token is launched against a real collectible market,
            and convertible into it.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 pb-8 gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold italic text-[#0B0D10]"
                style={{ backgroundColor: ACCENT }}
              >
                ,
              </div>
              <div>
                <div className="font-medium text-white text-sm">commas</div>
                <div className="text-sm text-zinc-500">
                  5 min read · Series: The Last Supper
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors border border-white/10 text-white bg-white/[0.03] hover:bg-white/10 h-10 w-10"
                aria-label="Jump to comments"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors border border-white/10 text-white bg-white/[0.03] hover:bg-white/10 h-10 px-4 py-2 gap-2 sm:w-fit w-full"
                aria-label="Share this post"
              >
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Article Body */}
        <article className="prose prose-invert prose-lg max-w-3xl mx-auto text-zinc-300 leading-relaxed">
          <p className="mb-6">
            Every launchpad sells you the same thing: a ticker, a picture, and a
            prayer that attention holds. The token is backed by nothing because
            there is nothing behind it. When the crowd moves on, there is no
            floor under the floor.
          </p>

          <p className="mb-6">
            <span className="font-bold italic text-white">commas</span> launches
            tokens differently. Every token is launched against a real
            collectible market: a PSA 10 graded card, or the floor of an NFT
            collection. Not inspired by it. Priced against it, with a live feed,
            and convertible into it.
          </p>

          <p className="mb-12">
            That last part is the whole story, so let us take it slowly.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            One token, one real thing
          </h2>

          <p className="mb-6">
            When someone launches a token on{" "}
            <span className="font-bold italic text-white">commas</span>, they
            pick the underlying: say, a PSA 10 Umbreon VMAX. From that moment the
            token has a reference price that does not come from its own chart. It
            comes from the card&apos;s real market, the places where actual
            copies actually sell.
          </p>

          <p className="mb-12">
            One million tokens represent one card. If the card is worth $2,100, a
            full unit of tokens is worth about $2,100 of exposure. The card
            doubles, your exposure doubles. You never graded, shipped, insured,
            or vaulted anything.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            The launch is the boring part, on purpose
          </h2>

          <p className="mb-6">
            Launching works like every launchpad you already know, and that is
            deliberate:
          </p>

          <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-zinc-600">
            <li>
              Every token starts at a 25 SOL market cap on a bonding curve.
            </li>
            <li>
              When the curve has raised 100 SOL, the market migrates
              automatically to an AMM, and the entire 100 SOL goes into the pool.
              No team allocation, no liquidity games: what was raised is what you
              trade against.
            </li>
            <li>
              Supply is fixed forever the moment the token is created. Nobody,
              including us, can ever mint more.
            </li>
          </ul>

          <p className="mb-12">
            Launching costs 0.1 SOL, takes about a minute, and the creator earns
            half of every trading fee the market ever generates. You can even
            route those fees to someone else: an X account, a YouTube channel, a
            forum legend who has no idea you exist. The fees wait in escrow until
            the real person claims them.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            The two doors
          </h2>

          <p className="mb-6">
            Here is where{" "}
            <span className="font-bold italic text-white">commas</span> stops
            being a launchpad and becomes a market. Every market has two ways in
            and two ways out:
          </p>

          <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-zinc-600">
            <li>
              <span className="text-white font-medium">The SOL door.</span> Buy
              and sell with SOL, like any token. These trades pay a 0.70% fee.
            </li>
            <li>
              <span className="text-white font-medium">The card door.</span> If
              you hold a real, vaulted copy of the collectible, you can deposit
              it and receive tokens worth exactly what the card is worth. And it
              works in reverse: pay tokens worth one card, and walk away with an
              actual card from the pool. The card door is completely free. No fee
              in either direction, on purpose: bringing the real thing into the
              market is the behavior we most want to reward.
            </li>
          </ul>

          <BlogFigure
            src="/figures/two-doors.png"
            caption="Two doors in, two doors out. The SOL legs pay the fee; the real-card legs pay nothing."
          />

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            Why token buying moves the real card
          </h2>

          <p className="mb-6">
            This is the question everyone should ask, so here is the mechanism,
            step by step. Say a wave of buying pushes the token above the
            card&apos;s real price:
          </p>

          <ol className="list-decimal pl-6 mb-6 space-y-2 marker:text-zinc-500">
            <li>
              The token now trades rich: tokens are worth more than the card they
              represent.
            </li>
            <li>
              That gap is free money for anyone holding a real copy: deposit the
              card, receive tokens worth more than the card, sell the difference.
            </li>
            <li>
              Where do those people get copies? The cheapest place possible: they
              buy the card&apos;s floor listings on the open market.
            </li>
            <li>
              Every copy they deposit gets locked in the pool, and every floor
              listing they bought is gone. Fewer copies for sale means a firmer,
              higher floor.
            </li>
            <li>
              The live price feed sees the higher floor and raises the
              token&apos;s reference price. The loop closes, one level up.
            </li>
          </ol>

          <p className="mb-6">
            Token demand literally consumes the collectible&apos;s cheapest
            supply. A memecoin pump buys nothing but its own chart. A{" "}
            <span className="font-bold italic text-white">commas</span> pump buys
            the floor of a real market.
          </p>

          <BlogFigure
            src="/figures/transmission.png"
            caption="How token buying reaches the floor price, and comes back as the index."
          />

          <p className="mb-6">
            And the reverse is softer than you would expect. If the token dumps
            below the card&apos;s value, the cheap exit is to buy tokens and
            redeem real cards from the pool, which supports the token on the way
            down. The pool can only release the copies it actually holds, so the
            downside is capped in a way the upside is not. The pool acts like a
            ratchet: it absorbs copies aggressively and gives them back
            reluctantly.
          </p>

          <BlogFigure
            src="/figures/asymmetry.png"
            caption="Upside is limited only by how many copies the market has listed. Downside is capped by what the pool holds."
          />

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            For the people who already own the cards
          </h2>

          <p className="mb-6">
            If you hold the collectible,{" "}
            <span className="font-bold italic text-white">commas</span> gives you
            two tools that never existed for cards before:
          </p>

          <ul className="list-disc pl-6 mb-12 space-y-2 marker:text-zinc-600">
            <li>
              <span className="text-white font-medium">
                Sell without selling.
              </span>{" "}
              Deposit a copy when the token is rich, take the premium, and buy
              back later. Your collection becomes a yield instrument.
            </li>
            <li>
              <span className="text-white font-medium">Hedge.</span> Lock SOL as
              collateral, draw tokens against it, and sell them to flatten your
              exposure without touching the physical card. When the token trades
              above the card&apos;s real price, the market literally pays hedgers
              to lean against it.
            </li>
          </ul>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            What keeps it honest
          </h2>

          <ul className="list-disc pl-6 mb-12 space-y-2 marker:text-zinc-600">
            <li>
              Supply is fixed at creation and can only shrink. The mint is dead.
            </li>
            <li>The curve&apos;s terms cannot be edited after launch. Ever.</li>
            <li>
              The price feed is smoothed, rate-limited, and wrapped in a circuit
              breaker: if a bad print deviates too far, the market freezes
              instead of moving.
            </li>
            <li>
              Swap pricing uses a time-averaged price, so a single-transaction
              sandwich cannot move the rate against you.
            </li>
          </ul>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            What is live, and what is next
          </h2>

          <p className="mb-6">
            The full protocol is live: launches, trading, the card door, hedging,
            and the price feeds, with the docs at{" "}
            <Link
              href="https://commas.art"
              className="hover:underline"
              style={{ color: ACCENT }}
            >
              commas.art
            </Link>{" "}
            covering every detail from a quickstart to the exact math. A{" "}
            <span className="font-bold italic text-white">commas</span> token
            will launch on{" "}
            <Link
              href="https://pump.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: ACCENT }}
            >
              pump.fun
            </Link>
            ; the announcement and the official contract address will come from{" "}
            <Link
              href="https://x.com/commasdotart"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: ACCENT }}
            >
              @commasdotart
            </Link>{" "}
            and nowhere else.
          </p>

          <p className="mb-12">
            Three panels were minted on Solana mainnet to mark the start. This
            post was Panel I. The next one opens the economics all the way up.
          </p>

          <div className="flex flex-col items-center gap-8 mt-12 mb-20">
            <Link
              href="https://commas.art"
              className="font-semibold px-6 py-3 rounded-xl transition-opacity hover:opacity-90 text-[#0B0D10]"
              style={{
                backgroundColor: ACCENT,
                boxShadow: "0 10px 15px -3px rgba(163, 230, 53, 0.2)",
              }}
            >
              Launch a token on commas
            </Link>
          </div>

          {/* Comments Card */}
          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full mb-8">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col gap-2">
              <h2 className="text-xl font-bold text-white">No comments yet</h2>
              <button
                type="button"
                className="font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-90 w-full my-4 h-10 text-[#0B0D10]"
                style={{ backgroundColor: ACCENT }}
              >
                Login to comment
              </button>
            </div>
          </div>
        </article>

        {/* Footer */}
        <footer className="mt-8 w-80 mx-auto flex flex-col justify-center pb-4">
          <div className="mx-auto flex flex-row gap-4 my-4 text-[#828181]">
            <Link
              href="https://x.com/commasdotart"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-all text-sm font-medium"
            >
              X / @commasdotart
            </Link>
            <Link
              href="https://commas.art"
              className="hover:text-white transition-all text-sm font-medium"
            >
              commas.art
            </Link>
          </div>

          <p className="text-sm text-center font-semibold text-[#828181] mb-4">
            The Last Supper, Panel I
          </p>
        </footer>
      </main>
    </div>
  );
}

function BlogFigure({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-10">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0B0D10]">
        <Image
          src={src}
          alt={caption}
          width={1900}
          height={1150}
          className="w-full h-auto"
        />
      </div>
      <figcaption className="text-sm text-zinc-500 mt-3 text-center">
        {caption}
      </figcaption>
    </figure>
  );
}

function SidebarIcon({
  icon: Icon,
  active,
}: {
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`p-3 rounded-xl transition-all relative group ${
        active
          ? "bg-white/10 text-lime-300"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
      }`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
