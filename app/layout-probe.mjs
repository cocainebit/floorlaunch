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
  let el = document.querySelector(".nav-tabs");
  for (let i = 0; i < 4 && el; i++) el = el.parentElement; // the row
  const row = el;
  const describe = (n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return {
      cls: [...n.classList].slice(0, 6).join(" "),
      x: Math.round(r.x), w: Math.round(r.width),
      flex: cs.flex, jc: cs.justifyContent,
    };
  };
  return {
    row: describe(row),
    rowParent: describe(row.parentElement),
    children: [...row.children].map(describe),
    parentChildren: [...row.parentElement.children].map(describe),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
