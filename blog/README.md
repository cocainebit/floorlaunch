# commas blog

The commas blog. First post: **The Last Supper, Panel I** — an explanatory
piece on what commas is and how it works, for a general audience.

Built with Next.js + Tailwind. The page layout was scaffolded from an
open-source blog template; all content, copy, images, figures, and branding
are commas' own.

## Run

```bash
bun install
bun run dev --port 5175
# → http://localhost:5175/blog
```

## Structure

- `src/app/blog/page.tsx` — the Panel I post (title, hero, body, figures, CTA)
- `src/app/layout.tsx` — metadata + Inter font
- `public/panel-i-cover.jpg` — the mainnet 1/1 Panel I artwork (hero)
- `public/figures/` — the economics diagrams (two-doors, transmission, asymmetry)
- `public/comma.png` — the comma brand mark

Source draft for the copy lives at `../BLOG-MASTER-PANEL-I.md`.
