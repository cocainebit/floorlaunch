import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto("https://solscan.io/token/7iMMDFqAp2W5S4SiYKQWVC4QksDGvGRFQarzrpyZqA9N", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: process.argv[2] });
await browser.close();
