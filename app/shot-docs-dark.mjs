import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem("theme", "dark"); localStorage.setItem("isDarkMode", "dark"); } catch {} });
await page.setViewport({ width: 1560, height: 1000 });
await page.goto("http://localhost:3333", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: process.argv[2] });
await browser.close();
