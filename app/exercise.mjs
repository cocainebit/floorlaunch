import puppeteer from "puppeteer-core";
const SHOT = "/private/tmp/claude-501/-Users-achi/e2322e9a-5583-4c02-abae-f17cb837a43c/scratchpad";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));
await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));

// capture initial trades-table first row + last candle info
const firstRow = () => page.$eval("tbody tr td", (el) => el.textContent).catch(() => null);
const t0 = await firstRow();

// switch through timeframes
for (const label of ["1m", "5m", "1h"]) {
  const btns = await page.$$(".tf-btn");
  for (const b of btns) {
    const txt = await b.evaluate((el) => el.textContent);
    if (txt === label) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${SHOT}/chart-${label}.png` });
}

// back to 15s, hover the chart for crosshair
const btns = await page.$$(".tf-btn");
for (const b of btns) if ((await b.evaluate((el) => el.textContent)) === "15s") { await b.click(); break; }
await new Promise((r) => setTimeout(r, 2500));
const chart = await page.$(".chart-holder");
const box = await chart.boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${SHOT}/chart-crosshair.png` });

// live update check: wait 25s, has the trades table advanced?
await new Promise((r) => setTimeout(r, 25000));
const t1 = await firstRow();
await page.screenshot({ path: `${SHOT}/chart-live.png` });

console.log(JSON.stringify({ tradesAdvanced: t0 !== t1, t0, t1, consoleErrors: errors.slice(0, 8) }, null, 2));
await browser.close();
