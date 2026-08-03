import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:3333", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 3500));
const info = await page.evaluate(() => {
  const copy = document.querySelector("#page-context-menu-button");
  if (!copy) return { err: "no copy btn" };
  const parent = copy.parentElement;
  const sib = [...(parent?.children ?? [])].filter((c) => c !== copy);
  const box = (el) => { if(!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { tag: el.tagName, cls: [...el.classList].slice(0,3).join(" "), w: Math.round(r.width), h: Math.round(r.height), padL: cs.paddingLeft, padR: cs.paddingRight, radius: cs.borderRadius }; };
  return { copy: box(copy), siblings: sib.map(box), parentCls: [...(parent?.classList ?? [])].slice(0,4).join(" ") };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
