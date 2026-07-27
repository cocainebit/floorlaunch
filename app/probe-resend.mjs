import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
await page.setViewport({ width: 1400, height: 900 });
await page.goto("https://resend.com/docs/introduction", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 5000));
const fonts = await page.evaluate(() => {
  const seen = new Map();
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const key = cs.fontFamily;
    if (!key) continue;
    const rec = seen.get(key) ?? { count: 0, sizes: new Set(), weights: new Set(), sample: "" };
    rec.count++;
    rec.sizes.add(cs.fontSize);
    rec.weights.add(cs.fontWeight);
    if (!rec.sample && el.textContent && el.textContent.trim().length > 3 && el.children.length === 0)
      rec.sample = el.textContent.trim().slice(0, 40);
    seen.set(key, rec);
  }
  const faces = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`);
  const colors = (() => {
    const b = getComputedStyle(document.body);
    const h1 = document.querySelector("h1") ? getComputedStyle(document.querySelector("h1")) : null;
    const a = document.querySelector("article a, main a") ? getComputedStyle(document.querySelector("article a, main a")) : null;
    const sb = document.querySelector("aside, nav") ? getComputedStyle(document.querySelector("aside, nav")) : null;
    return { bodyBg: b.backgroundColor, bodyColor: b.color, h1Color: h1?.color, h1Font: h1?.fontFamily, h1Weight: h1?.fontWeight, h1Size: h1?.fontSize, linkColor: a?.color, sideBg: sb?.backgroundColor };
  })();
  return {
    colors,
    families: [...seen.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([k, v]) => ({ family: k, els: v.count, weights: [...v.weights], sample: v.sample })),
    faces: [...new Set(faces)].slice(0, 12),
  };
});
console.log(JSON.stringify(fonts, null, 1));
await browser.close();
