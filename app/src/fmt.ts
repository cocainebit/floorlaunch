/**
 * Small-price formatting, launchpad-style: prices below 0.01 render with
 * subscript zero-run notation ("$0.0₅196" = five zeros then 196), so a
 * per-token price on a 1B-supply launch stays readable.
 */
const SUBS = "₀₁₂₃₄₅₆₇₈₉";

function sub(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUBS[Number(c)])
    .join("");
}

export function fmtSmallPrice(v: number, sigDigits = 3): string {
  if (!isFinite(v) || v <= 0) return "0";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 0.01) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const zeros = Math.floor(-Math.log10(v));
  const digits = Math.round(v * 10 ** (zeros + sigDigits))
    .toString()
    .replace(/0+$/, "") || "0";
  if (zeros <= 1) return v.toFixed(sigDigits + zeros);
  return `0.0${sub(zeros)}${digits}`;
}

export const fmtUsd = (v: number, sig = 3) => `$${fmtSmallPrice(v, sig)}`;
export const fmtSol = (v: number, sig = 3) => `${fmtSmallPrice(v, sig)} SOL`;
