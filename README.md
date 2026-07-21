# kage-gumi-tetsu

**Tetsu 鉄 — Wrench.** A personal motorcycle-maintenance app: a machined, murdered-out
Harley-Davidson Forty-Eight (XL1200X) build-book in monochrome metal. Garage log +
service intervals, a mods/build book, a maintenance logbook, and the full 2013 Sportster
workshop manual — openable and full-text searchable — plus a link-preview helper that
auto-fills a pasted accessory link with its picture, name and price.

Forked out of the **kage-gumi** monorepo (the numberless personal operative *Tetsu*),
kept as its own standalone web app. The kage-gumi lineage is preserved on purpose — the
repo stays in the `kage-gumi-*` family, and every `kg-` CSS class prefix and `data-kg-*`
attribute in the surface is intact.

## Stack

- **Frontend** — React 18 + Vite. Single surface `src/TetsuSurface.jsx` (local system
  fonts only — Bahnschrift condensed, Consolas mono, Yu Gothic for the 鉄 glyph — no web
  fonts). Installable PWA (manifest + service worker + `鉄` app icon).
- **Backend** — standalone Express (`server/index.js`), ESM. Serves the built UI (`dist/`)
  and the API on **one port, 5274** (`TETSU_PORT`).

## API

| Route | What it does |
|---|---|
| `GET /api/garage` | The whole garage (bikes, fluids, schedule, log, mods, manuals, torque). Corpus → seed → empty; reports `source`. Never 500s. |
| `POST /api/garage` | Persist the garage to the gitignored personal corpus (`data/garage/garage.json`). |
| `GET /api/manual/chapters` | List the workshop-manual chapters that exist on disk. |
| `GET /api/manual/chapter?id=` | One chapter's full text. |
| `GET /api/manual/search?q=` | Case-insensitive full-text search across all chapters. |
| `GET /api/link-preview?url=` | Best-effort og:image / title / price scrape for the MODS quick-add. |
| `POST /api/chat` | **Stub** — Ask-Tetsu chat (see Follow-ups). |

## Data & knowledge

- `data/garage.sample.json` — committed seed (blank starter template, the Forty-Eight
  scaffold). Rendered when no personal corpus exists.
- `data/garage/` — personal garage corpus, **gitignored** (only `.gitkeep` is tracked).
  On the box this is where the real bike + service history live.
- `knowledge/service-manual/*.txt` — the 2013 Sportster workshop manual, 8 plain-text
  chapters. This is what the `/api/manual/*` endpoints read (`MANUAL_DIR`).
- `knowledge/*.pdf` + `knowledge/forty-eight-*.txt` — the source PDFs (incl. the full
  ~48 MB factory service manual) and the Forty-Eight maintenance guides. Committed.

## Develop

```
npm install
npm run dev      # Vite UI on 5173, proxies /api → 5274
npm run start    # in another shell: the Express API/UI server on 5274
```

## Build

```
npm run build    # → dist/
npm run start    # serves dist/ + the API on 5274
```

Open http://localhost:5274.

## Deploy on the box (PM2)

PowerShell-safe — **one command per line, no `&&`**:

```
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Serves the UI + API on **5274**. Reach it from a phone on the LAN / Tailscale at
`http://kg-honbu:5274`, or expose `tetsu.kage-gumi.com → localhost:5274` via a Cloudflare
Tunnel. After a code update: `npm run build` then `pm2 restart kage-gumi-tetsu`.

## Follow-ups

- **Ask-Tetsu chat is a stub.** In the monorepo it hit the crew's shared Claude-backed
  `/api/chat`; standalone that runtime doesn't exist, so `POST /api/chat` returns a friendly
  placeholder in the shape the surface expects. Wire a real backend later (Anthropic API or
  the `claude` CLI) — see the `TODO` in `server/index.js`. The chat UI is intentionally left
  in place.
- **KG-side dashboard cleanup pending.** Tetsu now lives here as its own app; the monorepo's
  Tetsu surface / routing / `#tetsu` entry can be retired on the KG side in a follow-up.
