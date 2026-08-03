import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:3333", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 3500));
const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("header img, nav img, a[href='/'] img, a[href='/introduction'] img")];
  const logo = imgs.find((i) => (i.getAttribute("src")||"").includes("logo") || (i.alt||"").toLowerCase().includes("comma")) || imgs[0];
  if (!logo) return { err: "no logo img", imgcount: document.querySelectorAll("img").length };
  const r = logo.getBoundingClientRect();
  const cs = getComputedStyle(logo);
  const chain = []; let el = logo;
  for (let i=0;i<3 && el;i++){ chain.push(el.tagName+"."+[...el.classList].slice(0,3).join(".")); el = el.parentElement; }
  return { src: logo.getAttribute("src"), alt: logo.alt, w: Math.round(r.width), h: Math.round(r.height), cssH: cs.height, cls: [...logo.classList].slice(0,5).join(" "), chain };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
