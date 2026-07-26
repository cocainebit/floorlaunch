import puppeteer from "puppeteer-core";
const SHOT = "/private/tmp/claude-501/-Users-achi/e2322e9a-5583-4c02-abae-f17cb837a43c/scratchpad";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/?dev=1", { waitUntil: "networkidle2", timeout: 40000 });
await new Promise((r) => setTimeout(r, 5000));
for (const n of await page.$$(".nav-item")) if ((await n.evaluate((el) => el.textContent)) === "Launch") { await n.click(); break; }
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${SHOT}/lz-1-market.png` });

// select the second featured asset, continue
const assets = await page.$$(".lz-asset");
await assets[4].click();
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${SHOT}/lz-1-selected.png` });
await page.click(".lz-cta");
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${SHOT}/lz-2-fee.png` });

// fee: keep Me, continue
await page.click(".lz-cta");
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${SHOT}/lz-3-personalise.png` });

// personalise: fields are prefilled; add description
await page.type(".lz-textarea", "Liquid exposure to the collectible.");
await new Promise((r) => setTimeout(r, 300));
await page.click(".lz-cta");
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${SHOT}/lz-4-summary.png` });

// deploy
await page.click(".lz-cta");
let landed = false, err = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await page.$(".layout")) { landed = true; break; }
  err = await page.$eval(".lz-hint.bad", (el) => el.textContent).catch(() => null);
  if (err) break;
}
console.log(JSON.stringify({ landed, err, errors: errors.slice(0, 3) }));
await browser.close();
