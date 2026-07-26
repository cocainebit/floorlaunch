import puppeteer from "puppeteer-core";
const SHOT = "/private/tmp/claude-501/-Users-achi/e2322e9a-5583-4c02-abae-f17cb837a43c/scratchpad";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/?dev=1", { waitUntil: "networkidle2", timeout: 40000 });
await new Promise((r) => setTimeout(r, 6000)); // airdrop + connect

const walletLabel = await page.$eval(".wallet-btn", (el) => el.textContent);

// Execute a buy: set amount 2 SOL, click Buy CTA
await page.$eval(".amount-input", (el) => { el.value = ""; });
await page.type(".amount-input", "2");
await new Promise((r) => setTimeout(r, 400));
const ctaText0 = await page.$eval(".cta.buy", (el) => el.textContent);
await page.click(".cta.buy");
// wait for tx note
let txNote = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  txNote = await page.$eval(".tx-note", (el) => el.textContent).catch(() => null);
  if (txNote) break;
}

// Open the position tab
const tabs = await page.$$(".tab-btn");
for (const t of tabs) {
  if ((await t.evaluate((el) => el.textContent)) === "My position") { await t.click(); break; }
}
await new Promise((r) => setTimeout(r, 3000));
const positionRows = await page.$$eval(".panels-card .stat-row", (rows) =>
  rows.map((r) => r.textContent)
).catch(() => []);

// Open a hedge: fill collateral 5, click Open hedge
await page.$eval(".hedge-card .amount-input", (el) => { el.value = ""; });
await page.type(".hedge-card .amount-input", "5");
await new Promise((r) => setTimeout(r, 400));
await page.click(".hedge-card .cta");
let hedgeNote = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  hedgeNote = await page.$eval(".hedge-card .tx-note", (el) => el.textContent).catch(() => null);
  if (hedgeNote) break;
}
// refresh position tab
for (const t of await page.$$(".tab-btn")) {
  if ((await t.evaluate((el) => el.textContent)) === "Recent trades") { await t.click(); break; }
}
await new Promise((r) => setTimeout(r, 500));
for (const t of await page.$$(".tab-btn")) {
  if ((await t.evaluate((el) => el.textContent)) === "My position") { await t.click(); break; }
}
await new Promise((r) => setTimeout(r, 3000));
const positionAfterHedge = await page.$$eval(".panels-card .stat-row", (rows) =>
  rows.map((r) => r.textContent)
).catch(() => []);

await page.screenshot({ path: `${SHOT}/wallet-e2e.png` });
console.log(JSON.stringify({ walletLabel, ctaText0, txNote, hedgeNote, positionRows, positionAfterHedge, errors: errors.slice(0, 5) }, null, 2));
await browser.close();
