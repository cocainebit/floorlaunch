import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 950 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));
const navs = await page.$$(".nav-item");
for (const n of navs) {
  const t = await n.evaluate((el) => el.textContent);
  if (t?.trim() === "Index") { await n.click(); break; }
}
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: process.argv[2] });
await browser.close();
