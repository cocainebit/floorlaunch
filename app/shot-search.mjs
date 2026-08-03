import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
const errs=[]; page.on("pageerror",(e)=>errs.push(String(e).slice(0,120)));
await page.setViewport({ width: 1440, height: 950 });
await page.goto("http://localhost:5175/blog", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r=>setTimeout(r,3000));
// click the header search bar
const clicked = await page.evaluate(()=>{ const b=[...document.querySelectorAll("button")].find(x=>x.textContent?.includes("Search")); if(b){b.click();return true;} return false; });
await new Promise(r=>setTimeout(r,1500));
await page.screenshot({ path: process.argv[2] });
console.log("search clicked:",clicked,"| errors:",errs.length?errs.join(" | "):"none");
await browser.close();
