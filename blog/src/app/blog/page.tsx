"use client";

import {
  BarChart2,
  Copyright,
  ExternalLink,
  Home,
  LayoutGrid,
  type LucideIcon,
  Mail,
  MessageCircle,
  Moon,
  PenLine,
  Search,
  Share2,
  Twitter,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#141111] text-white selection:bg-purple-500/30 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-transparent z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <Image
              src="https://paragraph.com/_next/static/media/logomark_ivory.e208e06b.svg"
              alt="Logo"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          </Link>
          <button
            type="button"
            className="relative hidden md:flex ml-8 items-center gap-2 h-10 px-4 cursor-pointer text-sm group w-[240px]"
            style={{
              borderRadius: "calc(0.5rem + 8px)",
              color: "hsl(0 0% 80%)",
            }}
            aria-label="Search posts"
          >
            {/* Liquid Glass Visual Layers */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{
                borderRadius: "inherit",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.08), 0 0 8px rgba(0, 0, 0, 0.04)",
                transformOrigin: "50% 50%",
                transform: "scaleX(1.00003) scaleY(1.00019)",
              }}
            >
              {/* Glass Effect Layer with Backdrop Filter */}
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 0,
                  backdropFilter: "blur(1px) saturate(120%)",
                  WebkitBackdropFilter: "blur(1px) saturate(120%)",
                  isolation: "isolate",
                  borderRadius: "inherit",
                }}
              />
              {/* Tint Layer */}
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  background: "#1c1817",
                  borderRadius: "inherit",
                }}
              />
              {/* Shine Layer */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  zIndex: 2,
                  boxShadow:
                    "inset 0 0 0 1px hsl(30 8% 18% / 0.4), inset 1px 1px 0 0 rgba(255, 255, 255, 0.1)",
                  borderRadius: "inherit",
                }}
              />
            </div>

            {/* Content Layer */}
            <div
              className="relative flex items-center w-full h-full"
              style={{ zIndex: 3 }}
            >
              <Search className="h-4 w-4 shrink-0 mr-2" aria-hidden="true" />
              <span className="flex-1 text-left">Search...</span>
            </div>
          </button>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2">
          <button
            type="button"
            className="relative flex items-center gap-2 px-4 py-2 cursor-pointer hover:text-white transition-colors"
            style={{
              borderRadius: "9999px",
              color: "hsl(0 0% 80%)",
            }}
          >
            {/* Liquid Glass Visual Layers */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{
                borderRadius: "inherit",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.08), 0 0 8px rgba(0, 0, 0, 0.04)",
                transformOrigin: "50% 50%",
                transform: "scaleX(1.00003) scaleY(1.00019)",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 0,
                  backdropFilter: "blur(1px) saturate(120%)",
                  WebkitBackdropFilter: "blur(1px) saturate(120%)",
                  isolation: "isolate",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  background: "#1c1817",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  zIndex: 2,
                  boxShadow:
                    "inset 0 0 0 1px hsl(30 8% 18% / 0.4), inset 1px 1px 0 0 rgba(255, 255, 255, 0.1)",
                  borderRadius: "inherit",
                }}
              />
            </div>

            {/* Content Layer */}
            <div
              className="w-6 h-6 relative rounded overflow-hidden"
              style={{ zIndex: 3 }}
            >
              <Image
                src="/assets/banker-header.avif"
                alt="Bankr Logo"
                fill
                className="object-cover"
              />
            </div>
            <span
              className="text-base font-medium relative"
              style={{ zIndex: 3 }}
            >
              Bankr
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Dark Mode Button */}
          <button
            type="button"
            className="relative p-2 hover:text-white transition-colors"
            style={{
              borderRadius: "9999px",
              color: "hsl(0 0% 80%)",
            }}
          >
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{
                borderRadius: "inherit",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.08), 0 0 8px rgba(0, 0, 0, 0.04)",
                transformOrigin: "50% 50%",
                transform: "scaleX(1.00003) scaleY(1.00019)",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 0,
                  backdropFilter: "blur(1px) saturate(120%)",
                  WebkitBackdropFilter: "blur(1px) saturate(120%)",
                  isolation: "isolate",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  background: "#1c1817",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  zIndex: 2,
                  boxShadow:
                    "inset 0 0 0 1px hsl(30 8% 18% / 0.4), inset 1px 1px 0 0 rgba(255, 255, 255, 0.1)",
                  borderRadius: "inherit",
                }}
              />
            </div>
            <Moon className="w-5 h-5 relative" style={{ zIndex: 3 }} />
          </button>

          {/* Sign In Button */}
          <button
            type="button"
            className="hidden sm:block relative text-sm font-medium hover:text-white transition-colors px-4 py-2"
            style={{
              borderRadius: "calc(0.5rem + 8px)",
              color: "hsl(0 0% 80%)",
            }}
          >
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{
                borderRadius: "inherit",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.08), 0 0 8px rgba(0, 0, 0, 0.04)",
                transformOrigin: "50% 50%",
                transform: "scaleX(1.00003) scaleY(1.00019)",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 0,
                  backdropFilter: "blur(1px) saturate(120%)",
                  WebkitBackdropFilter: "blur(1px) saturate(120%)",
                  isolation: "isolate",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  zIndex: 1,
                  background: "#1c1817",
                  borderRadius: "inherit",
                }}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  zIndex: 2,
                  boxShadow:
                    "inset 0 0 0 1px hsl(30 8% 18% / 0.4), inset 1px 1px 0 0 rgba(255, 255, 255, 0.1)",
                  borderRadius: "inherit",
                }}
              />
            </div>
            <span className="relative" style={{ zIndex: 3 }}>
              Sign in
            </span>
          </button>

          <button
            type="button"
            className="text-[#27261b] text-sm font-medium px-4 py-2 rounded-full transition-colors shadow-lg hover:opacity-90"
            style={{
              backgroundColor: "#3550bf",
              boxShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.2)",
            }}
          >
            Subscribe
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-16 flex flex-col items-center justify-center gap-6 z-40 bg-[#141111]">
        <SidebarIcon icon={Home} />
        <SidebarIcon icon={Search} />
        <SidebarIcon icon={PenLine} active />
        <SidebarIcon icon={BarChart2} />
        <SidebarIcon icon={Mail} />
      </aside>

      {/* Main Content */}
      <main className="pl-0 md:pl-16 pt-24 pb-4 w-full max-w-[1000px] mx-auto px-4 sm:px-8 md:px-12">
        {/* Hero Image */}
        <div className="w-full aspect-[2/1] bg-[#a881fc] rounded-2xl mb-12 relative overflow-hidden shadow-2xl shadow-purple-900/20 group">
          <Image
            src="/assets/blog-banner.avif"
            alt="Crypto Doesn't Have to Be Complicated"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Title Block */}
        <div className="mb-12 max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl lg:text-3xl font-bold mb-4 tracking-tight leading-[1.1] whitespace-nowrap overflow-hidden text-ellipsis sm:whitespace-normal">
            Crypto Doesn't Have to Be Complicated
          </h1>
          <p className="text-xl text-zinc-400 font-light">
            Meet Bankr: Your Friendly AI-Powered Crypto Companion
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 pb-8 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold text-purple-200">
                SS
              </div>
              <div>
                <div className="font-medium text-white text-sm">
                  Shira Stember
                </div>
                <div className="text-sm text-zinc-500">
                  3 min read · July 24, 2025
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors border border-zinc-800 text-white bg-[#1c1817] hover:bg-zinc-800 hover:text-white h-10 w-10"
                aria-label="Jump to comments"
              >
                <div className="relative">
                  <MessageCircle className="h-4 w-4" />
                </div>
              </button>
              <button
                type="button"
                className="flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors border border-zinc-800 text-white bg-[#1c1817] hover:bg-zinc-800 hover:text-white h-10 px-4 py-2 gap-2 sm:w-fit w-full"
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
            Crypto often feels like everyone's speaking a different language and
            you weren't invited into the group chat. It's no surprise to us that
            almost 40% of people take one look at crypto and go "no thanks, I'm
            good" (
            <Link
              href="https://swyftx.com/wp-content/uploads/2024/09/swyftx-cryptocurrency-survey-2024.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              Swyftx Survey, 2024
            </Link>
            ).
          </p>

          <p className="mb-4">
            <Link
              href="https://cointelegraph.com/news/crypto-adoption-lack-technical-literacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              Lance Morginn
            </Link>
            , president of Blockchain Intelligence Group, explains:
          </p>

          <blockquote className="border-l-2 border-[#3b82f6] pl-6 my-8 italic text-zinc-400">
            "On first impressions, it can appear too technical and irrelevant to
            traditional money. Words such as blockchain, tokens and technology
            can lead to a sense of intimidation, discouraging people from
            checking crypto out."
          </blockquote>

          <p className="mb-12">
            When crypto is complicated, most people give up. We built Bankr to
            make crypto simple and accessible for everyone.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            The One Thing Crypto Twitter Actually Agrees On
          </h2>

          <p className="mb-6">
            Here's what's actually happening: 28% of people want to get into
            crypto but can't figure it out (
            <Link
              href="http://cryptoliteracy.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              CryptoLiteracy.org
            </Link>
            ). In the UK, it's even worse. 30% of adults took one look at crypto
            and said 'absolutely not' (
            <Link
              href="https://www.fca.org.uk/publications/research/cryptoasset-consumer-research-2023"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              FCA, 2023
            </Link>
            ).
          </p>

          <p className="mb-4">
            Good news though...Bankr isn't alone in recognizing the need for
            simplification. Ethereum’s founder Vitalik Buterin emphasized the
            need for more intuitive design when he stated:
          </p>

          <blockquote className="border-l-2 border-[#3b82f6] pl-6 my-8 italic text-zinc-400">
            "If we want crypto to be something that a billion people use, we
            need to make wallets and applications much more intuitive and much
            more user-friendly." (
            <Link
              href="https://www.youtube.com/watch?v=kibXhFxiCqY"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "#3b82f6" }}
            >
              DevCon Keynote
            </Link>
            )
          </blockquote>

          <p className="mb-12">
            That's literally our whole vibe. Making crypto so clean, everyone
            can use it.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            Bankr: Your New Crypto Bestie
          </h2>

          <p className="mb-6">
            Bankr removes all the complexity, sprinkles in some friendly vibes
            and makes crypto simple and enjoyable. No more juggling exchanges,
            wallets, and seed phrases. Just tell Bankr what you want.
          </p>

          <div className="my-10 relative">
            <div className="float-left w-full sm:w-1/2 mr-6 mb-6">
              <Image
                src="https://img.paragraph.com/cdn-cgi/image/format=auto,width=1080,quality=85/https://storage.googleapis.com/papyrus_images/807e30b9b0a8934e88584e805335273f.png"
                alt="Bankr Interface Screenshot"
                width={780}
                height={218}
                className="w-full h-auto rounded-lg"
              />
            </div>

            <p className="mb-6">
              That's it. Boom. Done. Bankr handles everything. Trading, checking
              your balance, moving crypto between chains... it all works the
              same way.
            </p>

            <p className="mb-12">
              So yes, Bankr is super simple, but what really makes this all feel
              so easy is that Bankr already lives in your social feed. Tag{" "}
              <Link
                href="https://x.com/bankrbot"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: "#3b82f6" }}
              >
                @bankrbot on X/Twitter
              </Link>{" "}
              or{" "}
              <Link
                href="https://farcaster.xyz/bankr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3b82f6] hover:text-[#3b82f6] hover:underline"
              >
                @bankr Farcaster
              </Link>{" "}
              or connect through your personal Bankr Terminal (
              <Link
                href="http://bankr.bot"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: "#3b82f6" }}
              >
                bankr.bot
              </Link>
              ). No new apps to download, no new passwords to remember. Just hit
              Bankr up wherever you're already scrolling.
            </p>
          </div>

          <div className="clear-both" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            For Everyone (Yes, Even Your Normie Friends)
          </h2>

          <p className="mb-12">
            Whether you just learned what ETH stands for or you've been hodling
            since 2017, Bankr's got your back. Complete beginners love it
            because Bankr is always there to hold your hand and answer all your
            questions. Advanced traders love it because it's a full on trading
            app that is fast, secure and ensures you have full control over
            funds at all times. Win-win for everyone and we are just getting
            started.
          </p>

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            The Community Said "Ship It" and We Did
          </h2>

          <p className="mb-6">
            Bankr started on Farcaster which is full of people experimenting,
            building and shipping real products weekly or even daily. That
            culture of collaboration, feedback, and transparency shaped a lot
            about how Bankr was developed. Bankr was and continues to be built
            alongside our community, regularly turning community input into new
            features people actually want, need and use.
          </p>

          <p className="mb-6">
            Did you know that a community member used{" "}
            <span style={{ color: "#3b82f6" }}>@bankrbot</span> to deploy a
            token through Clanker. They called it $BNKR. Plot twist? Our team
            had no idea it was happening. Most teams would've panicked. We said
            "this is our token now." This is what it looks like when you truly
            build with your community, not just for them.
          </p>

          <p className="mb-12">
            Because Bankr isn't just about making crypto simple; it's about
            exploring what's possible when AI, social, and crypto collide in the
            wildest ways.
          </p>

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            Cross-Chain, Not Chained Down
          </h2>

          <p className="mb-6">
            We don’t believe in staying stuck in one lane. Our $BNKR token lives
            on Base (shoutout to Coinbase’s speedy Layer-2). We’re cross-chain
            by design—supporting Polygon, Ethereum Mainnet, and Solana too.
            Whether you’re swapping, sending, or building, we make sure you’re
            not limited to one ecosystem.
          </p>

          <p className="mb-12">
            Why? Because crypto isn't just one network anymore. We want you to
            move seamlessly, skip the crazy fees, and access everything the
            multi-chain world has to offer. So go ahead—explore, build, and
            connect, wherever your wallet takes you. Bankr's there.
          </p>

          <hr className="my-8 border-white/[0.08]" />

          <h2 className="text-2xl font-bold text-white mt-12 mb-4">
            Ready to Get Started?
          </h2>

          <p className="mb-6">
            So that's Bankr. That's why we built it. That's why we brought
            together a team who genuinely believes crypto should be for
            everyone.
          </p>

          <p className="mb-6">
            We made something different. Something that just works. Something
            our friends actually use, and hopefully something you and your
            friends will love too.
          </p>

          <p className="mb-6">
            If you've been with us from the beginning, thank you. If you're new,
            welcome.
          </p>

          <p className="mb-12">
            Give it a shot. Send a transaction. See what crypto feels like when
            it's not trying to be complicated.
          </p>

          <div className="flex flex-col items-center gap-8 mt-12 mb-20">
            <p className="text-lg font-medium text-white text-center">
              👉 Start vibing with{" "}
              <span style={{ color: "#3b82f6" }}>@bankrbot</span> on X/Twitter
              or <span style={{ color: "#3b82f6" }}>@bankr</span> on Farcaster.
            </p>

            <button
              type="button"
              className="text-white font-medium px-6 py-3 rounded-xl transition-colors shadow-lg hover:opacity-90"
              style={{
                backgroundColor: "#3b82f6",
                boxShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.2)",
              }}
            >
              Get Started with Bankr
            </button>
          </div>

          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full mb-8">
            {/* Subscribe Card */}
            <div className="bg-[#1c1817] border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Image
                  src="https://img.paragraph.com/cdn-cgi/image/format=auto,width=256,quality=85/https://storage.googleapis.com/papyrus_images/3e73016bbdff778e5e5c42b99c6ebe4d.jpg"
                  alt="Bankr"
                  width={56}
                  height={56}
                  className="rounded-md shrink-0 w-14 h-14 object-cover"
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <h3 className="font-bold text-white text-xl line-clamp-1">
                    Subscribe to Bankr
                  </h3>
                  <p className="text-sm text-zinc-500">&lt;100 subscribers</p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#27261b] text-sm font-medium px-4 py-2.5 rounded-full transition-colors w-full md:w-auto hover:opacity-90"
                style={{ backgroundColor: "#3550bf" }}
              >
                Subscribe
              </button>
            </div>

            {/* Arweave TX Card */}
            <div className="bg-[#1c1817] border border-zinc-800 rounded-2xl p-4 relative group cursor-pointer hover:border-zinc-700 transition-colors">
              <div className="absolute top-4 right-4 text-zinc-500 group-hover:text-zinc-300">
                <ExternalLink className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-white mb-1">Arweave TX</h3>
              <p className="text-sm text-zinc-500 font-mono truncate pr-8">
                Tk83H27cWGUie1ZUlpSv8R25XTnfTrjxyGj4GzxrxOA
              </p>
            </div>

            {/* Comments Card */}
            <div className="bg-[#1c1817] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-2">
              <h2 className="text-xl font-bold text-white">No comments yet</h2>
              <button
                type="button"
                className="bg-[#e6ebfe] hover:bg-zinc-50 text-[#6c88f9] font-medium px-4 py-2 rounded-xl transition-colors w-full my-4 h-10"
              >
                Login to comment
              </button>
            </div>
          </div>
        </article>

        {/* Footer */}
        <footer className="mt-8 w-80 mx-auto flex flex-col justify-center pb-4">
          <button
            type="button"
            className="bg-[#e6ebfe] hover:bg-zinc-50 text-[#6c88f9] font-medium px-4 py-2 rounded-xl transition-colors w-full h-10"
          >
            Start writing
          </button>

          <div className="mx-auto flex flex-row gap-3 my-4 text-[#828181]">
            <Link
              href="https://farcaster.xyz/paragraph"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-all"
            >
              <LayoutGrid className="w-5 h-5" />
            </Link>
            <Link
              href="https://x.com/paragraph_xyz"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-all"
            >
              <Twitter className="w-5 h-5" />
            </Link>
            <Link
              href="https://paragraph.com/@blog"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-all"
              aria-label="Paragraph Blog"
            >
              <svg
                className="h-5 w-5 transition-all"
                width="30"
                height="30"
                viewBox="0 0 81 82"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
              >
                <title>Paragraph</title>
                <path
                  d="M6 0V76.1345H81"
                  stroke="currentColor"
                  strokeWidth="10.6585"
                  strokeMiterlimit="10"
                />
                <path
                  d="M34.4067 5.30176L6 76.1337L76.0722 46.9673"
                  stroke="currentColor"
                  strokeWidth="10.6585"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 76.129L59.0302 21.5845"
                  stroke="currentColor"
                  strokeWidth="10.6585"
                  strokeMiterlimit="10"
                />
              </svg>
            </Link>
          </div>

          <p className="text-sm text-center font-semibold text-[#828181] mb-2 flex items-center justify-center gap-1">
            <Copyright className="h-3.5 w-3.5" />
            2025 Paragraph Technologies Inc
          </p>

          <nav
            aria-label="Discover Paragraph content"
            className="text-xs text-center text-[#cccccc] mb-4 flex flex-row flex-nowrap gap-4 justify-center"
          >
            <Link
              href="/explore"
              className="shrink-0 hover:text-white transition-colors"
            >
              Popular
            </Link>
            <Link
              href="/explore/publications"
              className="shrink-0 hover:text-white transition-colors"
            >
              Trending
            </Link>
            <Link
              href="https://paragraph.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="https://paragraph.com/terms-of-use"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 hover:text-white transition-colors"
            >
              Terms
            </Link>
            <Link
              href="https://paragraph.com/home"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 hover:text-white transition-colors"
            >
              Home
            </Link>
          </nav>
        </footer>
      </main>
    </div>
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
      className={`p-3 rounded-xl transition-all relative group ${active ? "bg-[#e6ebfe] text-[#3e63f8] shadow-[0_0_15px_rgba(255,255,255,0.3)]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
    >
      <Icon className="w-5 h-5" />
      {active && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-1 h-8 bg-white/0 rounded-l-full"></div>
      )}
    </button>
  );
}
