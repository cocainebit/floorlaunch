import puppeteer from "puppeteer-core";
const theme = process.argv[2];
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 1100 });
await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("isDarkMode", t); } catch {} }, theme);
await page.goto("http://localhost:3333/how-it-works", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => window.scrollBy(0, 900));
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: process.argv[3] });
await browser.close();
