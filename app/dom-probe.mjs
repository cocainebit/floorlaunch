import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 900 });
await page.goto("http://localhost:3333", { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
const info = await page.evaluate(() => {
  const copyBtn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Copy page"));
  const tab = [...document.querySelectorAll("a, button")].find((b) => b.textContent?.trim() === "Guides");
  const chain = (el, n) => {
    const out = [];
    let cur = el;
    for (let i = 0; i < n && cur; i++) {
      out.push(cur.tagName + "." + [...cur.classList].slice(0, 4).join("."));
      cur = cur.parentElement;
    }
    return out;
  };
  return {
    copy: copyBtn ? chain(copyBtn, 3) : null,
    copyHtml: copyBtn ? copyBtn.outerHTML.slice(0, 300) : null,
    tab: tab ? chain(tab, 6) : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
