import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.setViewport({ width: 1440, height: 500 });
await page.goto("http://localhost:5175/blog", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 3000));
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Sign in");
  if (b) { b.click(); return true; }
  return false;
});
await new Promise((r) => setTimeout(r, 3500));
await page.screenshot({ path: process.argv[2] });
console.log("signin found:", clicked, "| pageerrors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
