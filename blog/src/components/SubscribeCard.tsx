"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "commas-subscribers";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SubscribeCard() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(`${STORAGE_KEY}-done`) === "1") setSubscribed(true);
    } catch {}
  }, []);

  const submit = () => {
    if (!EMAIL_RE.test(email.trim())) return;
    try {
      const list: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (!list.includes(email.trim())) list.push(email.trim());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      localStorage.setItem(`${STORAGE_KEY}-done`, "1");
    } catch {}
    setSubscribed(true);
  };

  return (
    <div
      id="subscribe"
      className="bg-[#1c1817] border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-bold text-white text-xl">Subscribe to commas</h3>
        <p className="text-sm text-zinc-500">
          The Last Supper series, in your inbox.
        </p>
      </div>

      {subscribed ? (
        <div className="flex items-center gap-2 text-sm text-white">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[#0b0d10] text-xs"
            style={{ backgroundColor: "#3550bf" }}
          >
            ✓
          </span>
          You&apos;re on the list.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="your@email.com"
            className="flex-1 bg-[#141111] border border-zinc-800 rounded-full px-4 h-11 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!EMAIL_RE.test(email.trim())}
            className="text-[#27261b] text-sm font-medium px-5 h-11 rounded-full transition-all duration-200 hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0"
            style={{ backgroundColor: "#3550bf" }}
          >
            Subscribe
          </button>
        </div>
      )}
    </div>
  );
}
