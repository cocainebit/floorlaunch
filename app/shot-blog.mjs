import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 1 });
await page.goto(process.argv[2] || "http://localhost:5175/blog", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: process.argv[3], fullPage: process.argv[4] === "full" });
await browser.close();
