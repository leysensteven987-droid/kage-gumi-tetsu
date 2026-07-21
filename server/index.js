// Tetsu 鉄 — Wrench: standalone Express server.
//
// Serves the built garage build-book UI (dist/) and the Tetsu API. Forked out of
// kage-gumi's frontend/server/index.js (the Tetsu block — garage loader + persist,
// the service-manual reader/search, and the MODS link-preview), rebuilt to stand on
// its own with no KG runtime around it. The `/tetsu` path segment is dropped from
// every route (KG namespaced them per-operative; standalone there's only Tetsu).
//
// Data / knowledge layout (repo-root relative, resolved from import.meta.url so cwd
// doesn't matter):
//   data/garage/             — personal garage corpus, one JSON per bundle (gitignored)
//   data/garage.sample.json  — committed seed fallback (blank starter template)
//   knowledge/service-manual/ — the 2013 Sportster workshop manual, 8 plain-text chapters
//
// Never a 500 on missing data: a missing corpus dir/file degrades to the seed, a
// missing seed degrades to an empty garage.

import express from "express";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const TETSU_GARAGE_DIR = path.join(DATA_DIR, "garage");
const TETSU_SEED_FILE = path.join(DATA_DIR, "garage.sample.json");
const MANUAL_DIR = path.join(REPO_ROOT, "knowledge", "service-manual");
const DIST_DIR = path.join(REPO_ROOT, "dist");

// ─── TETSU 鉄 — garage/maintenance corpus ────────────────────────────────────
// A committed seed (data/garage.sample.json) is the fallback so the shell renders on a
// fresh box. A personal (gitignored) corpus under data/garage/ overrides the seed.

// A FRESH blank garage every call — never share array references. loadTetsuGarage
// pushes into these, so aliasing a single module-level const would mutate it in place
// and make every GET accumulate the corpus (bikes 1→2→3, schedule 9→18→27…).
const blankGarage = () => ({ bikes: [], fluids: [], schedule: [], log: [], mods: [], manuals: [], torque: [], torqueNote: "" });

// The list keys that get merged/deduped (torqueNote is a plain string, handled apart).
const TETSU_LIST_KEYS = ["bikes", "fluids", "schedule", "log", "mods", "manuals", "torque"];

// Dedup an array of objects by JSON-identity (JSON.stringify), preserving first-occurrence
// order. Belt-and-suspenders against the load→save round-trip that used to compound
// duplicates: loadTetsuGarage concatenates every corpus JSON with push(...), the client
// POSTs the already-merged view back, and the POST persists it verbatim — so without a
// dedup each cycle doubled the corpus. Deduping on BOTH read and write makes that
// impossible. Non-array input degrades to [].
const dedupByJson = (arr) => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const key = JSON.stringify(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

function loadTetsuGarage() {
  // 1) personal corpus (gitignored) — merge every JSON bundle found
  try {
    const merged = blankGarage();
    let found = false;
    for (const e of readdirSync(TETSU_GARAGE_DIR, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const g = JSON.parse(readFileSync(path.join(TETSU_GARAGE_DIR, e.name), "utf8"));
        for (const k of TETSU_LIST_KEYS) {
          if (Array.isArray(g?.[k])) { merged[k].push(...g[k]); found = true; }
        }
        if (typeof g?.torqueNote === "string" && g.torqueNote) merged.torqueNote = g.torqueNote;
      } catch {}
    }
    // Defensive: dedupe every list before returning so whatever already sits on disk
    // (possibly compounded by the old round-trip) is cleaned on read.
    for (const k of TETSU_LIST_KEYS) merged[k] = dedupByJson(merged[k]);
    if (found) return { garage: merged, source: "corpus" };
  } catch {}
  // 2) committed seed fallback
  try {
    const seed = JSON.parse(readFileSync(TETSU_SEED_FILE, "utf8"));
    return { garage: { ...blankGarage(), ...seed }, source: "seed" };
  } catch {}
  return { garage: blankGarage(), source: "empty" };
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/garage", (_req, res) => {
  const { garage, source } = loadTetsuGarage();
  res.json({ ...garage, source });
});

// Persist the whole garage to the personal (gitignored) corpus. Writing this single
// file makes it the authoritative override of the committed seed (loadTetsuGarage
// prefers the corpus). Sanitised to the known shape so a malformed body can't poison
// the store; every list key is coerced to an array so the corpus stays authoritative
// even when emptied (an [] still counts as "found", so it never falls back to seed).
app.post("/api/garage", (req, res) => {
  try {
    const body = req.body || {};
    const clean = {};
    for (const k of TETSU_LIST_KEYS) {
      // Coerce to array, then dedupe by JSON-identity so the persisted corpus is ALWAYS
      // clean — this is the authoritative guard that stops the load→save cycle from ever
      // compounding duplicates at the source.
      clean[k] = dedupByJson(Array.isArray(body[k]) ? body[k] : []);
    }
    clean.torqueNote = typeof body.torqueNote === "string" ? body.torqueNote : "";
    mkdirSync(TETSU_GARAGE_DIR, { recursive: true });
    writeFileSync(path.join(TETSU_GARAGE_DIR, "garage.json"), JSON.stringify(clean, null, 2));
    res.json({ ok: true, source: "corpus" });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ─── TETSU 鉄 — service-manual READER (read-only) ─────────────────────────────
// The real 2013 Sportster workshop manual, split into 8 plain-text chapters under
// knowledge/service-manual/. Served openable + searchable to the MANUALS view. HARD
// path-traversal guard: only files on this fixed whitelist are ever read — user input
// is matched to an id on the list, never interpolated into a path.
const MANUAL_CHAPTERS = [
  { id: "index",              file: "00-index.txt",              label: "Index" },
  { id: "maintenance",        file: "01-maintenance.txt",        label: "Maintenance" },
  { id: "chassis",            file: "02-chassis.txt",            label: "Chassis" },
  { id: "engine",             file: "03-engine.txt",             label: "Engine" },
  { id: "fuel-system",        file: "04-fuel-system.txt",        label: "Fuel System" },
  { id: "drive-transmission", file: "05-drive-transmission.txt", label: "Drive & Transmission" },
  { id: "electrical",         file: "06-electrical.txt",         label: "Electrical" },
  { id: "appendices",         file: "07-appendices.txt",         label: "Appendices" },
];
const manualChapterById = (id) => MANUAL_CHAPTERS.find((c) => c.id === id) || null;

// Chapter list + cheap line counts. Missing files are omitted, never a 500.
app.get("/api/manual/chapters", (_req, res) => {
  const chapters = [];
  for (const c of MANUAL_CHAPTERS) {
    try {
      const p = path.join(MANUAL_DIR, c.file);
      if (!existsSync(p)) continue;
      const txt = readFileSync(p, "utf8");
      chapters.push({ id: c.id, label: c.label, file: c.file, lines: txt ? txt.split("\n").length : 0 });
    } catch {}
  }
  res.json({ chapters });
});

// One whitelisted chapter's raw text. Unknown id → 404 JSON; read error → {error}, never 500.
app.get("/api/manual/chapter", (req, res) => {
  const c = manualChapterById(String(req.query.id || ""));
  if (!c) return res.status(404).json({ error: "unknown chapter" });
  try {
    const text = readFileSync(path.join(MANUAL_DIR, c.file), "utf8");
    res.json({ id: c.id, label: c.label, text });
  } catch {
    res.json({ id: c.id, label: c.label, text: "", error: "chapter unreadable" });
  }
});

// Full-text search across all whitelisted chapters (case-insensitive substring). Read-only —
// NEVER writes. Blank q → no hits. Total hits capped so a common word can't return megabytes.
app.get("/api/manual/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ hits: [] });
  const needle = q.toLowerCase();
  const MAX_HITS = 60;
  const hits = [];
  for (const c of MANUAL_CHAPTERS) {
    if (hits.length >= MAX_HITS) break;
    let txt;
    try { txt = readFileSync(path.join(MANUAL_DIR, c.file), "utf8"); } catch { continue; }
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(needle)) continue;
      let snippet = lines[i].trim();
      if (snippet.length > 200) snippet = snippet.slice(0, 200) + "…";
      hits.push({ chapterId: c.id, chapterLabel: c.label, line: i + 1, snippet });
      if (hits.length >= MAX_HITS) break;
    }
  }
  res.json({ hits });
});

// ─── TETSU 鉄 — MODS link preview (read-only) ─────────────────────────────────
// Fetch a product page and pull an og:image (+ og:title + price) so a pasted accessory
// link gets an auto picture, name and price. READ-ONLY, no writes: best-effort, always
// 200 with {image,title,price} (nulls on any failure) so the client never blocks capture.
const decodeEntities = (s) => (typeof s === "string" ? s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">") : s);
// Match a <meta> whose identifying attribute === key, tolerating either attribute
// order (id-then-content OR content-then-id). `attrs` is the id-attribute pattern:
// property/name for OpenGraph/Twitter (default), or itemprop for schema.org microdata.
const metaContent = (html, key, attrs = "(?:property|name)") => {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+${attrs}\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*${attrs}\\s*=\\s*["']${k}["']`, "i");
  const m = html.match(a) || html.match(b);
  return m ? decodeEntities(m[1]) : null;
};
// Currency-code → symbol for the common ones; unknown codes render as a suffix.
const CUR_SYM = { EUR: "€", USD: "$", GBP: "£", JPY: "¥" };
// Format an amount + currency into a compact string ("€620", "$49.99", "620 SEK").
const fmtPrice = (amount, cur) => {
  if (amount == null || amount === "") return null;
  const n = String(amount).trim();
  if (!n) return null;
  const c = (cur || "").trim().toUpperCase();
  if (!c) return n;
  return CUR_SYM[c] ? `${CUR_SYM[c]}${n}` : `${n} ${c}`;
};
// Walk a parsed JSON-LD value (object / array / @graph / nested offers) for the
// first offer price, formatted. Recursion is bounded by the document's own depth.
const findOffer = (node) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const el of node) { const p = findOffer(el); if (p) return p; } return null; }
  if (node.offers) { const p = findOffer(node.offers); if (p) return p; }
  const amount = node.price ?? node.lowPrice ?? node.highPrice;
  const p = fmtPrice(amount, node.priceCurrency);
  if (p) return p;
  if (node["@graph"]) return findOffer(node["@graph"]);
  return null;
};
// Best-effort price scrape: OpenGraph product-price meta first, then the first
// JSON-LD offer. Returns a formatted string or null — always non-fatal.
const extractPrice = (html) => {
  const mAmount = metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount");
  if (mAmount) {
    const p = fmtPrice(mAmount, metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency"));
    if (p) return p;
  }
  // schema.org microdata — very common on shop pages: <meta itemprop="price" content="142.00">
  // (+ itemprop="priceCurrency"). This is what most WooCommerce/OXID/Magento themes emit.
  const mdAmount = metaContent(html, "price", "itemprop");
  if (mdAmount) {
    const p = fmtPrice(mdAmount, metaContent(html, "priceCurrency", "itemprop"));
    if (p) return p;
  }
  const blocks = html.match(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const body = b.replace(/^[\s\S]*?>/, "").replace(/<\/script\s*>$/i, "");
    let json;
    try { json = JSON.parse(body); } catch { continue; }
    const p = findOffer(json);
    if (p) return p;
  }
  return null;
};
app.get("/api/link-preview", async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url || ""));
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("scheme");
  } catch {
    return res.status(400).json({ error: "bad url" });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const r = await fetch(target.href, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KageGumi/1.0)" },
      redirect: "follow",
      signal: controller.signal,
    });
    const ctype = r.headers.get("content-type") || "";
    if (!r.ok || !ctype.includes("text/html")) return res.json({ image: null, title: null, price: null });
    const finalUrl = r.url || target.href;
    let html = await r.text();
    if (html.length > 400 * 1024) html = html.slice(0, 400 * 1024); // stay cheap
    let image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    const title = metaContent(html, "og:title");
    const price = extractPrice(html);
    if (image) {
      try { image = new URL(image, finalUrl).href; } catch {} // resolve relative src
    }
    res.json({ image: image || null, title: title || null, price: price || null });
  } catch {
    res.json({ image: null, title: null, price: null }); // preview is non-fatal
  } finally {
    clearTimeout(timer);
  }
});

// ─── ASK TETSU chat — STUB ────────────────────────────────────────────────────
// In the KG monorepo this POSTs to the crew's shared /api/chat (a real Claude-backed
// operative). That runtime doesn't exist standalone, so return a friendly 200 in the
// shape the surface reads (`data.reply`). It never shells out to claude.
// TODO: wire real chat (Anthropic API / claude CLI) — see README Follow-ups.
app.post("/api/chat", (_req, res) => {
  res.json({
    reply: "Ask-Tetsu chat isn't wired up in the standalone app yet. The garage log, service-manual search and link preview all work — the chat is a stub for now.",
  });
});

// ─── static UI + SPA fallback ─────────────────────────────────────────────────
// Serve the built UI. Static assets first, then SPA fallback to index.html for any
// non-/api route so client-side routing / deep links resolve.
app.use(express.static(DIST_DIR));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  const indexFile = path.join(DIST_DIR, "index.html");
  if (existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(404).send("UI not built yet — run `npm run build`.");
});

const PORT = process.env.TETSU_PORT || 5274;
app.listen(PORT, () => {
  console.log(`Tetsu 鉄 — Wrench listening on http://localhost:${PORT}`);
});
