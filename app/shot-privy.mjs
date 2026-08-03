import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
// click the connect/wallet button
const btn = await page.$("button.wallet-btn, .wallet-btn, .top-right button");
if (btn) { await btn.click(); await new Promise((r) => setTimeout(r, 3500)); }
await page.screenshot({ path: process.argv[2] });
console.log("pageerrors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
