import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: process.argv[2] ?? "shot.png" });
await browser.close();
console.log("shot saved");
