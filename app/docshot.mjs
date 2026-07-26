import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 2 });
await page.goto("http://localhost:3333", { waitUntil: "networkidle2", timeout: 40000 });
await new Promise((r) => setTimeout(r, 3500));
const state = await page.evaluate(() => {
  const cards = document.querySelectorAll(".fl-card");
  const live = document.querySelectorAll(".fl-card[data-live]");
  const cssLoaded = [...document.styleSheets].some((s) => {
    try { return [...s.cssRules].some((r) => r.cssText?.includes("fl-card-grid")); }
    catch { return false; }
  });
  return { cards: cards.length, liveWired: live.length, cssLoaded };
});
// hover the middle card to trigger tilt if JS is live
const card = (await page.$$(".fl-card"))[1];
if (card) {
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.3);
  await new Promise((r) => setTimeout(r, 700));
}
await page.screenshot({ path: "/private/tmp/claude-501/-Users-achi/e2322e9a-5583-4c02-abae-f17cb837a43c/scratchpad/docs-cards.png" });
console.log(JSON.stringify(state));
await browser.close();
