import { useState, useEffect, useMemo, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   TETSU · WRENCH   (monochrome-metal garage build-book)

   A fully RE-SKINNED surface that lives inside the runtime but reads as its own
   product — a machined, murdered-out Harley Forty-Eight build-book rendered in
   monochrome metal: brushed-steel type, a chrome (metallic-gradient) accent
   instead of any colour, and the 鉄 kanji as the motif. No orange, no skull, no
   hazard stripe — the accent is CHROME, not a hue. De-KG'd — no Shadow Crew
   chrome, local system faces only (Bahnschrift condensed display, Consolas
   mono, Yu Gothic for the 鉄 glyph). Reached at #tetsu.

   LAYOUT-2.0 PORT (2026-07-15): restructured to the approved 鉄 GARAGE mockup.
   The old right-hand aside is retired; the ground + body text ride the shared
   --kg-* theme tokens (legible in dark AND light), while the metal brand lives
   in --tt-* vars with a light-theme override (dark machined steel on washi).

     • GARAGE   — the bench page: Forty-Eight nameplate hero (brushed plate,
                  rivets), odometer roller + stepper, oil-life dial, NEXT WRENCH
                  callout, all service intervals (live DUE/SOON/OK vs the
                  odometer + today), the service log as a brush-spine, and the
                  bench reference (torque card + fluids & capacities).
     • GEAR     — the build book: every part, mod and piece of kit, by status
                  (installed / stock / planned / wishlist). The data key stays
                  "mods" so no stored garage needs migrating.
     • LOGBOOK  — the maintenance history, newest-first, each entry a card
                  with a photo/screenshot slot (real image drop is later).
     • MANUALS  — the manual shelf + the full-text workshop-manual reader.

   Data comes from GET /api/garage. The committed seed
   (data/tetsu/garage.sample.json) is a blank starter template — real bike +
   reference specs, but no personal history — and is also the offline fallback
   so the shell always renders. EDIT mode turns every section into inline forms
   (bike, odometer, fluids, schedule, mods, logbook, manuals, torque); SAVE
   POSTs the whole garage to POST /api/garage, which persists it to the
   personal, gitignored corpus (_output/tetsu/garage/garage.json) — the corpus
   overrides the seed on the next load, so entered data survives a restart.

   Branding stays covert: root carries data-kg-* attribution; children use
   kg-tt-* classes. Nothing KG is ever shown to the eye.
   ────────────────────────────────────────────────────────────────────────── */

// ─── Tetsu palette — monochrome metal, re-based on the KG theme tokens ────────
// Layout-2.0 port (2026-07-15): the page GROUND + body TEXT ride the shared
// --kg-* theme tokens so both dark and light stay legible; the METAL brand
// (chrome gradient, brushed steel, rivets) lives in --tt-* vars declared in the
// component <style> with a [data-theme="light"] override (dark chrome on light
// washi instead of light chrome on gunmetal). NEVER append hex alpha to a var()
// — use mix() below.
const BLACK      = "var(--kg-bg-deep)";      // deepest well — odometer bg, inputs
const INK        = "var(--kg-bg-page)";      // ground (root background)
const GUN        = "var(--kg-bg-card)";      // panel
const GUN2       = "var(--kg-bg-card-alt)";  // raised card
const GUN3       = "var(--tt-raise)";        // stepper / highlight (theme-tuned)
const LINE       = "var(--kg-border)";       // hairline seam
const LINE_STR   = "var(--kg-border-strong)";// stronger seam
const STEEL      = "var(--tt-steel)";        // brushed-metal secondary text
const STEEL_DIM  = "var(--tt-steel-dim)";    // dim label
const FAINT      = "var(--kg-text-faint)";   // faintest
const CHROME     = "var(--tt-chrome)";       // chrome solid highlight — borders, mono values
const BONE       = "var(--kg-text)";         // primary text
const BONE_DIM   = "var(--kg-text-body)";

// Service status colours — MUTED/desaturated so they read as function, not brand.
// Theme-tuned in the --tt-* block (deepened on the light washi ground).
const DUE  = "var(--tt-due)";   // muted crimson — over interval / overdue
const SOON = "var(--tt-soon)";  // bronze (not orange) — approaching
const OK   = "var(--tt-ok)";    // muted steel — within interval

// Alpha on a var() token — color-mix, never a hex suffix (var(--x)55 is invalid CSS).
const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

// ─── Type — all local system faces (no @import; renders on the box) ───────────
const F_COND  = "'Bahnschrift SemiBold','Bahnschrift','DIN Condensed','Arial Narrow',sans-serif"; // display: wordmark, headings, buttons, seg control, bike name — condensed UPPERCASE
const F_UI    = "'Bahnschrift','Segoe UI',system-ui,sans-serif";                                  // body / task text
const F_MONO  = "'Consolas',ui-monospace,'SFMono-Regular',monospace";                             // odometer, intervals, torque, km, labels
const F_KANJI = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";                                 // the 鉄 kanji (gothic cut)

// ─── Chrome text treatment — the signature (wordmark, header kanji, nameplate) ─
// Gradient + emboss shadow are theme vars: light chrome on the dark grounds,
// dark machined steel on the light washi ground (a light gradient would vanish).
const chromeText = {
  backgroundImage: "var(--tt-grad)",
  WebkitBackgroundClip: "text", backgroundClip: "text",
  color: "transparent", WebkitTextFillColor: "transparent",
  filter: "drop-shadow(0 1px 0 var(--tt-grad-shadow))",
};

const ODO_STEP = 500;    // odometer stepper increment (km)

// View segments for the main pane (default GARAGE — the layout-2.0 bench page:
// hero nameplate + odometer roller + oil dial + intervals + log spine + bench
// reference; the id stays "maintenance" so no state wiring moves).
const VIEWS = [
  { id: "maintenance", label: "GARAGE",    kanji: "車", tab: "GARAGE" },
  { id: "mods",        label: "GEAR",      kanji: "装", tab: "GEAR" },
  { id: "logbook",     label: "LOGBOOK",   kanji: "録", tab: "LOG" },
  { id: "manuals",     label: "MANUALS",   kanji: "書", tab: "MANUAL" },
  { id: "chat",        label: "ASK TETSU", kanji: "鉄", tab: "ASK" },
];

// Per-mod status styling — reuses the service-status tokens so no new hue enters
// the surface. installed → OK (muted steel-green), stock → STEEL (owned but not
// fitted, brushed metal), planned → SOON (bronze), wishlist → dim faint chrome.
const MOD_STATUS_META = {
  installed: { color: OK,        label: "INSTALLED", filled: false },
  stock:     { color: STEEL,     label: "STOCK",     filled: false },
  planned:   { color: SOON,      label: "PLANNED",   filled: false },
  wishlist:  { color: STEEL_DIM, label: "WISHLIST",  filled: false },
};

// Urgency sort order for the scored schedule.
const RANK = { due: 0, soon: 1, ok: 2 };

// Thousands-separated km (en-GB → "21,600"). Self-contained, no external deps.
function fmtKm(n) {
  if (n == null || isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-GB");
}

// Derive a readable title from a pasted URL (hostname minus www); falls back to the raw string.
function hostFromUrl(u) {
  try { return new URL(u.trim()).hostname.replace(/^www\./, ""); }
  catch { return u.trim(); }
}

// Downscale an image File to a JPEG data URL — longest side ≤ maxPx — so an uploaded
// phone photo inlines into the garage corpus at a few hundred KB instead of several MB.
// Uses createImageBitmap (honors EXIF orientation) with an <img> fallback for old engines.
async function downscaleToDataUrl(file, maxPx = 1600, quality = 0.85) {
  const draw = (imgW, imgH, drawFn) => {
    const scale = Math.min(1, maxPx / Math.max(imgW, imgH));
    const w = Math.max(1, Math.round(imgW * scale));
    const h = Math.max(1, Math.round(imgH * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    drawFn(c.getContext("2d"), w, h);
    return c.toDataURL("image/jpeg", quality);
  };
  if (typeof createImageBitmap === "function") {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { bmp = await createImageBitmap(file); }
    const url = draw(bmp.width, bmp.height, (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h));
    bmp.close && bmp.close();
    return url;
  }
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = objUrl;
    });
    return draw(img.naturalWidth, img.naturalHeight, (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h));
  } finally { URL.revokeObjectURL(objUrl); }
}

// Parse a cost string ("€142.00", "142,00 €", "$49.99", "620 SEK", "1.234,50 €") into
// { sym, value }. Best-effort: pulls a currency token + a number, resolving EU vs US
// decimal style by which separator sits last. Returns null when there's no number.
function parseCost(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const sym = (s.match(/[€$£¥]/) || [])[0] || (s.match(/\b[A-Z]{3}\b/) || [])[0] || "";
  let n = s.replace(/[^0-9.,]/g, "");
  if (!n) return null;
  const lc = n.lastIndexOf(","), ld = n.lastIndexOf(".");
  if (lc > -1 && ld > -1)      n = lc > ld ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  else if (lc > -1)           n = (n.length - lc - 1) <= 2 ? n.replace(",", ".") : n.replace(/,/g, "");
  else if ((n.match(/\./g) || []).length > 1) n = n.replace(/\./g, "");
  const value = parseFloat(n);
  return isFinite(value) ? { sym, value } : null;
}

// Sum an array of mods' costs, grouped by currency → "€362.00", or "€362.00 + $50.00"
// when currencies are mixed, or "—" when nothing has a parseable price.
function sumCosts(list) {
  const byCur = {};
  for (const m of list) {
    const p = parseCost(m && m.cost);
    if (!p) continue;
    byCur[p.sym] = (byCur[p.sym] || 0) + p.value;
  }
  const parts = Object.entries(byCur).map(([sym, v]) => {
    const num = v.toFixed(2);
    return /^[€$£¥]$/.test(sym) ? `${sym}${num}` : sym ? `${num} ${sym}` : num;
  });
  return parts.length ? parts.join(" + ") : "—";
}

// Format a Date as YYYY-MM-DD without any timezone drift (built from local parts).
function fmtDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Compute a maintenance status for one schedule item from the CURRENT odometer
// and today's date. Returns level ('due'|'soon'|'ok') plus the km/day margins
// used to render the row. Baseline items (never done yet) are pinned to 'ok'.
function computeStatus(item, currentOdo, now) {
  // SPECIAL: an item never performed (no date + odo 0) is a clean baseline, not
  // a fault — it can never read 'due' just because the bike has kilometres on it.
  if (item.lastDate === "" && item.lastKm === 0) {
    return { level: "ok", baseline: true, kmLeft: null, daysLeft: null, nextKm: null, dueDate: null };
  }

  const kmLeft = item.intervalKm != null ? (item.lastKm + item.intervalKm) - currentOdo : null;
  const nextKm = item.intervalKm != null ? item.lastKm + item.intervalKm : null;

  let daysLeft = null;
  let dueDate  = null;
  if (item.intervalMonths != null && item.lastDate) {
    const [y, m, d] = item.lastDate.split("-").map(Number);
    dueDate  = new Date(y, (m - 1) + item.intervalMonths, d);        // local, month-safe
    daysLeft = Math.round((dueDate - now) / 86400000);
  }

  let level = "ok";
  if ((kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0)) {
    level = "due";
  } else if ((kmLeft != null && kmLeft <= 0.15 * item.intervalKm) || (daysLeft != null && daysLeft <= 45)) {
    level = "soon";
  }
  return { level, baseline: false, kmLeft, daysLeft, nextKm, dueDate };
}

// Human interval string, e.g. "every 8,000 km · 12 mo".
function intervalText(item) {
  const parts = [];
  if (item.intervalKm != null) parts.push(`every ${fmtKm(item.intervalKm)} km`);
  if (item.intervalMonths != null) parts.push(`${item.intervalMonths} mo`);
  return parts.join(" · ") || "on condition";
}

const API_GET = (p) => fetch(p).then(r => (r.ok ? r.json() : Promise.reject(r.status)));

// Offline fallback — a tiny valid subset so the surface is never blank if kg-api
// is unreachable. The full committed corpus is served by GET /api/garage
// (data/tetsu/garage.sample.json); this is deliberately minimal, not a mirror.
const FALLBACK = {
  source: "offline",
  bikes: [
    { id: "hd-fortyeight-2013", photo: "", make: "Harley-Davidson", model: "Forty-Eight", code: "XL1200X",
      year: 2013, engine: "Evolution 1202 cc · air-cooled 45° V-twin",
      drive: "Belt final drive · 5-speed", odometer: 0, unit: "km",
      fuel: "Petrol 95+ (E10 ok) · 7.9 L peanut tank",
      tirePressureFront: "2.5 bar (36 psi)", tirePressureRear: "2.5 bar (36 psi)",
      notes: "Evo Sportster. Belt drive: no chain." },
  ],
  fluids: [
    { name: "Engine oil", spec: "H-D 20W-50 (SYN3)", capacity: "2.8 qt (2.6 L)" },
    { name: "Brake fluid", spec: "DOT 4", capacity: "—" },
  ],
  schedule: [
    { id: "oil",   task: "Engine oil + filter", intervalKm: 8000, intervalMonths: 12, lastKm: 0, lastDate: "", note: "Warm through, drain, new filter." },
    { id: "belt",  task: "Drive belt · tension + wear", intervalKm: 8000, intervalMonths: null, lastKm: 0, lastDate: "", note: "Cold deflection 1/4–5/16 in (6.35–7.94 mm), no cracks." },
    { id: "fork",  task: "Front fork · oil + seals", intervalKm: 80000, intervalMonths: null, lastKm: 0, lastDate: "", note: "Baseline: not done yet." },
  ],
  log: [],
  mods: [],
  manuals: [
    { title: "Sportster Service Manual 2013", type: "PDF", ref: "99484-13", note: "Official H-D workshop manual: the source for procedures + torque specs." },
  ],
  torque: [
    { item: "Primary chaincase drain plug", value: "19.0–40.7 Nm (14–30 ft-lb)" },
    { item: "Spark plug", value: "16.3–24.4 Nm (12–18 ft-lb)" },
  ],
  torqueNote: "Guideline values: always verify against the official workshop manual (99484-13).",
};

// ── Rivet — a small machined dot, corner accents only (theme-tuned metal) ─────
function Rivet({ style }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%",
      background: "radial-gradient(circle at 35% 30%, var(--tt-rivet-hi), var(--tt-rivet-lo) 72%)",
      boxShadow: "0 0 0 1px var(--tt-rivet-ring)",
      pointerEvents: "none", ...style }} />
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FRONT PAGE — 01 · LATE EDITION (shipped 2026-07-25)
   The GARAGE display path is a broadsheet front page printed at the plant —
   ported from the locked style study (_output/personal/tetsu-frontpage-study.html,
   variant 01 + the SUNDAY EDITION quiet frame). All values below are lifted from
   that file, not re-improvised. The page is STATE-AUTHORED: kicker, headline,
   stamp, standfirst, INSIDE/BRIEF box, ramp and folio jump-line are all functions
   of the real bike state — three honest registers (crisis / watch / quiet).
   Local faces only. The paper ground renders in both themes (Forge Light IS the
   page). EDIT mode still renders the old bench forms — turning the paper over.
   ════════════════════════════════════════════════════════════════════════════ */

// Paper palette — exact hexes from the study's :root.
const FP = {
  paper: "#f4f2ec", conc: "#e6e3dc", seam: "#d5d1c6", stone: "#767268", ink: "#111214",
  ok: "#3f6b52", brass: "#8a6a2f", due: "#b3232e", rule: "#b6b2a7",
  body: "#3a3d42", mid: "#4c4f54", redEdge: "#7d1820", redSmall: "#f2cfd3", greenSmall: "#cfe0d5",
};
// The study's condensed face (plain Bahnschrift so font-stretch percentages bite).
const FP_COND = "'Bahnschrift','DIN Condensed','Arial Narrow',sans-serif";

// "Drive belt — tension + wear" → { base:"Drive belt", sub:"tension + wear" }.
// "Engine oil + filter" → { base:"Engine oil", sub:"+ filter" }. Parentheticals
// drop, "/" collapses to a space so headlines stay speakable for any item name.
function fpBaseName(task) {
  let t = String(task || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  let base = t, sub = "";
  const m = t.split(/\s*(?:—|–|·|:)\s*/);
  if (m.length > 1) { base = m[0]; sub = m.slice(1).join(" · "); }
  const pm = base.split(/\s+\+\s+/);
  if (pm.length > 1) {
    const extra = "+ " + pm.slice(1).join(" + ");
    sub = sub ? `${extra} · ${sub}` : extra;
    base = pm[0];
  }
  base = base.replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
  return { base, sub: sub.replace(/\s+/g, " ").trim() };
}
const fpPlural = (base) => { const w = base.trim().split(/\s+/).pop().toLowerCase(); return /s$/.test(w) && !/ss$/.test(w); };

// "25 JUL 2026" — the study's dateline register.
function fpDateShort(d) {
  if (!d) return "—";
  const M = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${String(d.getDate()).padStart(2, "0")} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

// Headline for the register — generated + grammatical for any item name.
// 76px is the study size for short lines; longer names shrink to keep the rag
// inside the sheet. The packer scores every ≤3-line split and STRONGLY prefers
// ones whose first two lines clear x≈210 — the stamp must land in the notch of
// the rag, never on top of the type (the study's whole point).
function fpHeadline(reg, worst) {
  if (reg === "quiet" || !worst) return { lines: ["ALL", "QUIET.", "GO RIDE."], size: 76 };
  const { base } = fpBaseName(worst.task);
  const verb = fpPlural(base) ? "ARE" : "IS";
  const term = reg === "crisis" ? `${verb} DUE.` : `${verb} NEXT.`;
  const words = ["THE", ...base.toUpperCase().split(/\s+/), term];
  const n = words.length;
  const L = Math.min(3, n);
  let best = null;
  const consider = (lines) => {
    const maxLen = Math.max(...lines.map(l => l.length));
    const size = Math.max(38, Math.min(76, Math.floor(830 / maxLen)));
    // condensed cap ≈ 0.44·size wide; the stamp starts at x=210, type at x=17
    const notch = lines.slice(0, Math.min(2, lines.length)).every(l => l.length * 0.44 * size < 190);
    const score = (notch ? 1000 : 0) + size;
    if (!best || score > best.score) best = { lines, size, score };
  };
  const walk = (start, picks, acc) => {
    if (picks === 0) {
      const lines = []; let prev = 0;
      for (const bp of [...acc, n]) { lines.push(words.slice(prev, bp).join(" ")); prev = bp; }
      consider(lines);
      return;
    }
    for (let i = start; i <= n - picks; i++) walk(i + 1, picks - 1, [...acc, i]);
  };
  walk(1, L - 1, []);
  return best || { lines: [words.join(" ")], size: 40 };
}

// Lane display name — the ramp's name column is ~90px (to the TODAY axis at 104),
// so long items compress the way the study did ("Primary / transmission oil" →
// "PRIMARY OIL"): first + last word when the last is a real word, else first two.
function fpLaneName(base) {
  const U = base.toUpperCase();
  if (U.length <= 13) return U;
  const w = U.split(/\s+/);
  if (w.length >= 3) {
    const last = w[w.length - 1];
    const cand = /^[A-Z]{3,}$/.test(last) ? `${w[0]} ${last}` : `${w[0]} ${w[1]}`;
    if (cand.length <= 15) return cand;
  }
  return w[0];
}

// Ramp lane model — one honest convention per data shape:
//   over km/date → the red hatched lane left of TODAY (the study's crisis lane 1)
//   km runway that fits → solid bar to scale (brass when SOON, ink when OK, green on a quiet page)
//   km runway beyond the post → torn bar, "OFF THE CHART →"
//   date-only ahead → no bar (a days figure "BY THE CALENDAR" — mixing day-km scales would lie)
//   baseline (never logged) → dashed hollow runway, "NOT YET LOGGED"
const FP_BAR_FULL = 256, FP_BAR_TORN = 236;   // px — study: bar-to-post 256, torn quiet bars 236
function fpLaneModel(item, svcRef, scale) {
  const s = item.status;
  const { base } = fpBaseName(item.task);
  const nm = fpLaneName(base);
  if (s.baseline) {
    return { kind: "baseline", nm, small: `EVERY ${fmtKm(item.intervalKm)} KM · NOT LOGGED`,
      big: fmtKm(item.intervalKm), vsmall: "KM CYCLE · BASELINE" };
  }
  if (s.kmLeft != null && s.kmLeft <= 0) {
    return { kind: "over", nm, small: `DUE ${fmtKm(s.nextKm)}`,
      big: `−${fmtKm(-s.kmLeft)}`, vsmall: "KM PAST · WRENCH FIRST" };
  }
  if (s.kmLeft == null && s.daysLeft != null && s.daysLeft <= 0) {
    return { kind: "over", nm, small: `DUE ${fpDateShort(s.dueDate)}`,
      big: `−${-s.daysLeft}`, vsmall: "DAYS PAST · WRENCH FIRST" };
  }
  if (s.kmLeft != null) {
    const w = scale ? Math.round(s.kmLeft * scale) : null;
    if (w == null || w > FP_BAR_FULL) {
      return { kind: "torn", nm, small: `DUE ${fmtKm(s.nextKm)}`,
        big: fmtKm(s.kmLeft), vsmall: "KM · OFF THE CHART →" };
    }
    const isSvc = svcRef && item.id === svcRef.id;
    return { kind: "bar", w: Math.max(10, w), tone: s.level, nm, small: `DUE ${fmtKm(s.nextKm)}`,
      big: fmtKm(s.kmLeft), vsmall: isSvc ? "KM · TO THE POST" : "KM OF RUNWAY" };
  }
  return { kind: "date", nm, small: `DUE ${fpDateShort(s.dueDate)}`,
    big: String(s.daysLeft), vsmall: "DAYS · BY THE CALENDAR" };
}

// The whole edition, authored from state. Pure — returns copy + models only.
function fpEdition({ items, entries, odo, oilItem, now, bike, unit }) {
  // Real targets, most urgent first (urgency rank, then proximity; days weighed
  // at ~40 km/day only to interleave date items sensibly in the ordering).
  const prox = s => s.status.kmLeft != null ? s.status.kmLeft : (s.status.daysLeft != null ? s.status.daysLeft * 40 : 1e9);
  const targets = items
    .filter(s => !s.status.baseline && (s.status.nextKm != null || s.status.dueDate != null))
    .sort((a, b) => (RANK[a.status.level] - RANK[b.status.level]) || (prox(a) - prox(b)));
  const worst = targets[0] || null;
  const reg = worst && worst.status.level === "due" ? "crisis"
            : worst && worst.status.level === "soon" ? "watch" : "quiet";
  const accent = reg === "crisis" ? FP.due : reg === "watch" ? FP.brass : FP.ok;

  // The ENGINE oil item (the app's oilItem prop can resolve to primary/chaincase
  // oil, which is neither the sump nor the full service).
  const engineOil = items.find(s => s.intervalKm != null && !s.status.baseline
    && (s.id === "oil" || /engine\s*oil/i.test(s.task || ""))) || null;

  // The post — the study's rule (its quiet frame proves it): the FULL SVC / engine
  // oil milestone anchors the chart when it's live; anything further runs off the
  // chart torn. Without one, the furthest km target holds the post instead.
  const kmTargets = targets.filter(t => t.status.nextKm != null && t.status.kmLeft > 0);
  const svcRef = (engineOil && engineOil.status.nextKm != null && engineOil.status.kmLeft > 0)
    ? engineOil
    : (kmTargets.length ? kmTargets.reduce((a, b) => (b.status.nextKm > a.status.nextKm ? b : a)) : null);
  const isFullSvc = !!(svcRef && engineOil && svcRef.id === engineOil.id);
  const svcLeft = svcRef ? svcRef.status.kmLeft : null;
  const scale = svcLeft ? FP_BAR_FULL / svcLeft : null;

  // Lanes: up to 3 — targets first, then baseline km items fill the page.
  const baselines = items.filter(s => s.status.baseline && s.intervalKm != null);
  const lanes = [...targets, ...baselines].slice(0, 3).map(it => fpLaneModel(it, svcRef, scale));

  // Registers of copy —
  const kicker = reg === "crisis" ? "THE BENCH RULES —" : reg === "watch" ? "THE BENCH WATCHES —" : "THE BENCH REPORTS —";
  const editionName = reg === "crisis" ? "LATE EDITION" : reg === "watch" ? "EVENING EDITION" : "SUNDAY EDITION";
  const thru = reg === "crisis" ? "GEAR LOCKER" : reg === "watch" ? "LOG BOOK" : "ROAD SECTION";
  const folioRight = reg === "crisis" ? "CONTINUED ON THE BENCH, p.2 →"
                   : reg === "watch" ? "THE BENCH WAITS, p.2 →" : "NO WORK CARRIES OVER →";
  const head = fpHeadline(reg, worst);

  // Stamp — the overrun / runway / all-clear verdict.
  let stamp;
  if (reg === "crisis") {
    const s = worst.status;
    const { sub } = fpBaseName(worst.task);
    if (s.kmLeft != null && s.kmLeft <= 0) {
      stamp = { a: s.kmLeft === 0 ? "DUE NOW" : `${fmtKm(-s.kmLeft)} KM OVER`,
        b: `${(sub || "on the bench").toUpperCase()} · ${fmtKm(s.nextKm)}` };
    } else {
      stamp = { a: s.daysLeft === 0 ? "DUE TODAY" : `${-s.daysLeft} DAYS OVER`,
        b: `BY THE CALENDAR · ${fpDateShort(s.dueDate)}` };
    }
  } else if (reg === "watch") {
    const s = worst.status;
    const { sub } = fpBaseName(worst.task);
    stamp = s.kmLeft != null
      ? { a: `${fmtKm(s.kmLeft)} KM LEFT`, b: `${(sub || "on watch").toUpperCase()} · DUE ${fmtKm(s.nextKm)}` }
      : { a: `${s.daysLeft} DAYS LEFT`, b: `BY THE CALENDAR · ${fpDateShort(s.dueDate)}` };
  } else {
    const near = targets[0] || null;
    stamp = { a: "NOTHING OWED",
      b: near
        ? (near.status.kmLeft != null ? `NEXT WORK · ${fmtKm(near.status.kmLeft)} KM` : `NEXT WORK · ${near.status.daysLeft} DAYS`)
        : "NO WORK ON FILE" };
  }

  // Oil-life percentage — the real number in the sump.
  let oilPct = null;
  if (engineOil) {
    const used = Math.max(0, odo - (engineOil.lastKm || 0));
    oilPct = Math.max(0, Math.min(100, Math.round((1 - used / engineOil.intervalKm) * 100)));
  }

  // Standfirst — generated, grammatical, honest. <b>/<span> tones per the study.
  const second = targets[1] || null;
  const deck = [];
  let k = 0;
  const T = t => deck.push(<span key={k++}>{t}</span>);
  const B = t => deck.push(<b key={k++} style={{ color: FP.ink, fontWeight: 700 }}>{t}</b>);
  const C = (t, col) => deck.push(<span key={k++} style={{ color: col, fontWeight: 700 }}>{t}</span>);
  // Will the full-service clause print anything? (Decides ";" vs "." endings.)
  const svcShows = (force) => !!((svcRef && (force || !worst || svcRef.id !== worst.id)) || oilPct != null);
  const secondClause = (semi) => {
    if (!second) return;
    const sb = fpBaseName(second.task).base;
    const cap = sb.charAt(0).toUpperCase() + sb.slice(1).toLowerCase();
    if (second.status.kmLeft != null) { T(` ${cap} follows in `); B(`${fmtKm(second.status.kmLeft)} ${unit}`); T(semi ? `;` : `.`); }
    else { T(` ${cap} follows on `); B(fpDateShort(second.status.dueDate)); T(semi ? `;` : `.`); }
  };
  const svcClause = (cap, force) => {
    const the = cap ? " The" : " the";
    if (svcRef && (force || !worst || svcRef.id !== worst.id)) {
      const what = isFullSvc ? "full service" : `${fpBaseName(svcRef.task).base.toLowerCase()} post`;
      T(`${the} ${fmtKm(svcRef.status.nextKm)} ${what} holds at `);
      B(`${fmtKm(svcRef.status.kmLeft)} out`);
      if (oilPct != null) { T(`, `); C(`${oilPct}% oil life`, reg === "crisis" ? FP.due : FP.ok); T(` in the sump`); }
      T(`.`);
    } else if (oilPct != null) {
      T(` `); C(`${oilPct}% oil life`, reg === "crisis" ? FP.due : FP.ok); T(` in the sump.`);
    } else { /* nothing honest to add */ }
  };
  if (reg === "crisis") {
    const { base, sub } = fpBaseName(worst.task);
    const bl = base.toLowerCase();
    const pron = fpPlural(base) ? "their" : "its";
    if (worst.status.kmLeft != null && worst.status.kmLeft <= 0) {
      T(`The ${bl} ran ${fmtKm(-worst.status.kmLeft)} ${unit} past ${pron} mark — ${sub ? sub.toLowerCase() : "the bench"} `);
      B(`before anything else turns`); T(`.`);
    } else {
      T(`The ${bl} ran ${-worst.status.daysLeft} days past ${pron} date — ${sub ? sub.toLowerCase() : "the bench"} `);
      B(`before anything else turns`); T(`.`);
    }
    secondClause(svcShows(false)); svcClause(!second, false);
  } else if (reg === "watch") {
    const { base, sub } = fpBaseName(worst.task);
    T(`Nothing is overdue — yet. The ${base.toLowerCase()} comes due in `);
    if (worst.status.kmLeft != null) B(`${fmtKm(worst.status.kmLeft)} ${unit}`);
    else B(`${worst.status.daysLeft} days`);
    T(`${sub ? ` — ${sub.toLowerCase()} when it lands` : ""}.`);
    secondClause(svcShows(false)); svcClause(!second, false);
  } else if (entries.length) {
    const e0 = entries[0];
    T(`${e0.title} logged at `); B(`${fmtKm(e0.odo)}`);
    T(` ${fpRelDay(e0.date, now).toLowerCase()}. `);
    B(`Nothing on the bench.`);
    svcClause(true, true);
    T(` The paper has no verdict to print today.`);
  } else {
    T(`Nothing on the bench, nothing in the log. Every interval stands at its baseline — `);
    B(`log the first wrench`);
    T(` and the paper starts keeping score. No verdict to print today.`);
  }
  deck.push(<span key={k++} className="kg-fp-end" aria-hidden="true"
    style={{ display: "inline-block", width: 8, height: 8, background: FP.ink, marginLeft: 6 }} />);

  // INSIDE index (crisis/watch) or the quiet-day IN BRIEF fed from the real log.
  let box;
  if (reg === "quiet" && entries.length) {
    box = { kind: "brief", title: `AT THE BENCH — ${fpRelDay(entries[0].date, now)}`,
      lines: entries.slice(0, 2).map(e => ({ t: (e.title || "WORK DONE").toUpperCase(), at: fmtKm(e.odo) })) };
  } else {
    box = { kind: "inside" };
  }

  // Axis tick (a round km step that fits the scale) + the post label.
  let tickKm = null;
  if (svcLeft) {
    for (const c of [20000, 10000, 5000, 2500, 2000, 1000, 500, 250, 200, 100, 50]) {
      if (c <= svcLeft / 2) { tickKm = c; break; }
    }
  }
  const post = svcRef ? {
    label: isFullSvc ? `FULL SVC · ${fmtKm(svcRef.status.nextKm)}`
      : `${fpLaneName(fpBaseName(svcRef.task).base)} · ${fmtKm(svcRef.status.nextKm)}`,
  } : null;

  return { reg, accent, kicker, editionName, thru, folioRight, head, stamp, deck, box,
    lanes, post, scale, tickKm, targetsCount: targets.length };
}

// Relative day label for the brief — TODAY / YESTERDAY / "24 JUL".
function fpRelDay(dateStr, now) {
  if (!dateStr) return "LATELY";
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return "LATELY";
  const then = new Date(y, m - 1, d);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - then) / 86400000);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  return fpDateShort(then).slice(0, 6).trim();
}

// ── FIG. 1 — the service ramp, composed exactly as the study draws it ─────────
function FpRamp({ lanes, post, tickKm, scale, quiet }) {
  const AX = 104, BX = 107;             // study: TODAY axis x=104 (3px), bars start 107
  const tops = [34, 92, 150];
  const ticks = [];
  if (tickKm && scale) {
    for (let i = 1; i <= 2; i++) {
      const x = Math.round(AX - 4 + tickKm * i * scale);
      if (x <= 330) ticks.push({ x, label: `+${fmtKm(tickKm * i)}` });
    }
  }
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 582, bottom: 36, borderTop: `3px solid ${FP.ink}`, zIndex: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "5px 14px 4px", borderBottom: `1px solid ${FP.rule}` }}>
        <span style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, textTransform: "uppercase",
          fontSize: 14, letterSpacing: 2, color: FP.ink, whiteSpace: "nowrap" }}>Fig. 1 · The Service Ramp</span>
        <span style={{ fontFamily: F_MONO, fontSize: 8.5, letterSpacing: 0.8, color: FP.mid, whiteSpace: "nowrap" }}>
          {quiet ? "0 = TODAY · NOTHING BEHIND YOU" : "0 = TODAY · ←PAST | AHEAD→"}
        </span>
      </div>
      {/* TODAY axis line */}
      <div style={{ position: "absolute", left: AX, top: 32, bottom: 22, width: 3, background: FP.ink, zIndex: 4 }} />

      {lanes.length === 0 && (
        <div style={{ position: "absolute", left: 14, right: 40, top: 90, fontFamily: F_MONO, fontSize: 10,
          letterSpacing: 1.2, color: FP.mid, lineHeight: 1.9 }}>
          NO INTERVALS ON FILE — TAP THE ODOMETER, EDIT THE PAPER.
        </div>
      )}

      {lanes.map((ln, i) => {
        const top = tops[i];
        const nmOnRed = ln.kind === "over";
        // bar geometry per kind
        let bar = null, val = null;
        if (ln.kind === "over") {
          bar = <div className="kg-fp-red" style={{ width: AX }} />;
          val = { left: 118, top: 8, size: 23, color: FP.due, inline: false };
        } else if (ln.kind === "bar") {
          const fill = quiet ? FP.ok : (ln.tone === "soon" ? FP.brass : FP.ink);
          bar = <div style={{ position: "absolute", left: BX, top: 22, height: 22, width: ln.w, background: fill, zIndex: 2 }} />;
          val = ln.w >= 140
            ? { left: ln.w >= 220 ? 200 : 118, top: 24, size: 17, color: FP.paper, inline: true, z: 6 }
            : { left: BX + ln.w + 9, top: 8, size: 23, color: ln.tone === "soon" ? FP.brass : FP.ink, inline: false };
        } else if (ln.kind === "torn") {
          bar = <div className="kg-fp-torn" style={{ position: "absolute", left: BX, top: 22, height: 22,
            width: FP_BAR_TORN, background: FP.ink, zIndex: 2 }} />;
          val = { left: 118, top: 26, size: 16, color: FP.paper, inline: true, z: 6 };
        } else if (ln.kind === "baseline") {
          bar = <div style={{ position: "absolute", left: BX, top: 22, height: 22, width: FP_BAR_TORN,
            border: `1.5px dashed ${FP.stone}`, zIndex: 2 }} />;
          val = { left: 118, top: 26, size: 16, color: FP.ink, inline: true, z: 6 };
        } else { // date-only ahead — no bar, an honest days figure
          val = { left: 118, top: 8, size: 23, color: FP.ink, inline: false };
        }
        // study: the −100 caption inherits the red val; green-bar smalls go pale
        // green, ink-bar smalls go seam, everything on paper goes stone.
        const smallColor = ln.kind === "over" ? FP.due
          : (val.inline && ln.kind !== "baseline") ? (quiet && ln.kind === "bar" ? FP.greenSmall : FP.seam) : FP.stone;
        return (
          <div key={`${ln.nm}-${i}`} style={{ position: "absolute", left: 0, right: 0, top, height: 52 }}>
            {bar}
            <div style={{ position: "absolute", left: 14, top: 5, width: 92, fontFamily: FP_COND, fontStretch: "72%",
              fontWeight: 700, textTransform: "uppercase", fontSize: 16, letterSpacing: 1,
              color: nmOnRed ? FP.paper : FP.ink, zIndex: 5, lineHeight: 1 }}>
              {ln.nm}
              <small style={{ display: "block", fontFamily: F_MONO, fontSize: 8, letterSpacing: 0.7,
                color: nmOnRed ? FP.redSmall : FP.mid, fontWeight: 400, marginTop: 3, maxWidth: 90, lineHeight: 1.45 }}>
                {ln.small}
              </small>
            </div>
            <div style={{ position: "absolute", left: val.left, top: val.top, fontFamily: FP_COND,
              fontStretch: "70%", fontWeight: 700, fontSize: val.size, lineHeight: 1, color: val.color,
              zIndex: val.z || 3, whiteSpace: "nowrap" }}>
              {ln.big}
              <small style={{ fontFamily: F_MONO, fontSize: 8, letterSpacing: 0.7, fontWeight: 400,
                ...(val.inline ? { display: "inline", marginLeft: 5, verticalAlign: 2 } : { display: "block", marginTop: 3 }),
                color: smallColor }}>
                {ln.vsmall}
              </small>
            </div>
          </div>
        );
      })}

      {post && (
        <div style={{ position: "absolute", right: 0, top: 32, bottom: 22, width: 26, background: FP.ink, zIndex: 1 }}>
          <span style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            writingMode: "vertical-rl", fontFamily: F_MONO, fontSize: 9, letterSpacing: 1.8,
            color: FP.paper, whiteSpace: "nowrap" }}>{post.label}</span>
        </div>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22, borderTop: `1px solid ${FP.rule}` }}>
        <i style={{ position: "absolute", left: 100, top: 4, fontStyle: "normal", fontFamily: F_MONO,
          fontSize: 9, letterSpacing: 1, color: FP.mid }}>0</i>
        {ticks.map(t => (
          <i key={t.x} style={{ position: "absolute", left: t.x, top: 4, fontStyle: "normal",
            fontFamily: F_MONO, fontSize: 9, letterSpacing: 1, color: FP.mid }}>{t.label}</i>
        ))}
      </div>
    </div>
  );
}

// ── The front page itself — full-bleed sheet, chop-column nav, tap-to-step odo ─
function FrontPage({ bike, odo, unit, items, entries, oilItem, now, view, onNav, onEdit, updBike }) {
  const [odoOpen, setOdoOpen] = useState(false);
  const ed = useMemo(
    () => fpEdition({ items, entries, odo, oilItem, now, bike, unit }),
    [items, entries, odo, oilItem, now, bike, unit]
  );

  // Legibility scale (2026-07-25): the sheet is a fixed 393×852 art board, which
  // read as a stranded phone-width strip on desktop. Zoom the whole sheet to the
  // container — exact width-fit on phones, roughly half the window on desktop —
  // so every point size on the page grows together and the paper reads like a
  // paper. CSS `zoom` (not transform) so layout/scroll height follow for free.
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (!w) return;
      const s = w <= 700 ? Math.min(1.25, w / 393) : Math.min(1.75, Math.max(1, (w * 0.5) / 393));
      setScale(Math.round(s * 1000) / 1000);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const digits = String(Math.max(0, Math.round(odo))).padStart(6, "0").slice(-6);
  const bikeLine = bike
    ? `${/harley/i.test(bike.make || "") ? "H-D" : (bike.make || "").toUpperCase()} ${(bike.model || "").toUpperCase()}${bike.code ? ` · ${bike.code}` : ""}`.trim()
    : "NO UNIT ON FILE";
  const edNo = Math.max(1, Math.floor(odo / 100));
  const quiet = ed.reg === "quiet";

  return (
    <div ref={wrapRef} className="kg-fp-wrap" data-kg-component="tetsu-frontpage" data-kg-owner="kg"
      style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", background: FP.paper,
        // shared print texture — newsprint fibre + faint column screen (study .sheet)
        backgroundImage: "repeating-linear-gradient(180deg,rgba(17,18,20,.024) 0 1px,transparent 1px 54px),repeating-linear-gradient(90deg,rgba(17,18,20,.014) 0 1px,transparent 1px 3px)" }}>
      <div className="kg-fp-sheet" style={{ position: "relative", width: 393, maxWidth: "100%",
        margin: "0 auto", minHeight: 852, overflow: "hidden", color: FP.ink, zoom: scale }}>

        {/* masthead — cropped odometer digits bleeding off the top edge; tap = stepper */}
        <div role="button" tabIndex={0} aria-label={`Odometer ${fmtKm(odo)} ${unit} — tap to adjust`}
          onClick={() => setOdoOpen(o => !o)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOdoOpen(o => !o); } }}
          style={{ position: "absolute", top: -22, left: -8, fontFamily: FP_COND, fontStretch: "70%",
            fontWeight: 700, fontSize: 112, letterSpacing: 7, lineHeight: 1, color: FP.ink,
            whiteSpace: "nowrap", zIndex: 6, cursor: "pointer", userSelect: "none" }}>
          {digits.slice(0, 3)}
          <em style={{ fontStyle: "normal", color: "transparent", WebkitTextStroke: `2.5px ${FP.ink}` }}>{digits.slice(3)}</em>
        </div>
        {/* edition line between hairline + heavy masthead rule — classic double rule */}
        <div style={{ position: "absolute", top: 91, left: 0, right: 0, display: "flex", justifyContent: "space-between",
          padding: "5px 14px 6px", borderTop: `1px solid ${FP.rule}`, borderBottom: `3px solid ${FP.ink}`,
          fontFamily: F_MONO, fontSize: 9, letterSpacing: 0.4, color: FP.mid, zIndex: 2 }}>
          <span style={{ whiteSpace: "nowrap" }}>No. {edNo} · {ed.editionName}</span>
          <span style={{ whiteSpace: "nowrap" }}>{bikeLine}</span>
          <span style={{ whiteSpace: "nowrap" }}>{fpDateShort(now)}</span>
        </div>

        {/* odometer stepper — the ±500 behaviour, revealed by tapping the masthead */}
        {odoOpen && (
          <div style={{ position: "absolute", top: 116, left: 14, right: 14, zIndex: 9, display: "flex", gap: 6 }}>
            <button className="kg-fp-chop" aria-label={`Odometer minus ${ODO_STEP}`}
              onClick={() => updBike("odometer", Math.max(0, odo - ODO_STEP))}
              style={{ background: FP.ink, color: FP.paper, fontFamily: F_MONO, fontWeight: 700, fontSize: 12,
                letterSpacing: 1, padding: "9px 12px" }}>−{ODO_STEP}</button>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${FP.ink}`, background: FP.conc, fontFamily: F_MONO, fontWeight: 700,
              fontSize: 12, letterSpacing: 1.5 }}>{fmtKm(odo)} {unit.toUpperCase()}</div>
            <button className="kg-fp-chop" aria-label={`Odometer plus ${ODO_STEP}`}
              onClick={() => updBike("odometer", odo + ODO_STEP)}
              style={{ background: FP.ink, color: FP.paper, fontFamily: F_MONO, fontWeight: 700, fontSize: 12,
                letterSpacing: 1, padding: "9px 12px" }}>+{ODO_STEP}</button>
            <button className="kg-fp-chop" onClick={onEdit}
              style={{ background: FP.due, color: FP.paper, fontFamily: F_MONO, fontWeight: 700, fontSize: 12,
                letterSpacing: 1, padding: "9px 12px" }}>EDIT</button>
          </div>
        )}

        {/* kicker + ragged headline; the stamp lives in the notch of the rag */}
        <div style={{ position: "absolute", top: 137, left: 20, fontFamily: F_MONO, fontSize: 11,
          letterSpacing: 2.6, color: ed.accent, zIndex: 3, fontWeight: 700 }}>{ed.kicker}</div>
        <h1 style={{ position: "absolute", top: 156, left: 17, margin: 0, fontFamily: FP_COND,
          fontStretch: "70%", fontWeight: 700, textTransform: "uppercase", lineHeight: 0.88,
          color: FP.ink, fontSize: ed.head.size, letterSpacing: 0, zIndex: 3 }}>
          {ed.head.lines.map((l, i) => <span key={i} style={{ display: "block" }}>{l}</span>)}
        </h1>
        <div style={{ position: "absolute", top: 182, right: 8, transform: "rotate(-7deg)", zIndex: 4,
          border: `3px solid ${ed.accent}`, outline: `1.5px solid ${ed.accent}`, outlineOffset: 3,
          background: "rgba(244,242,236,.85)", padding: "8px 11px 7px", color: ed.accent, textAlign: "center",
          boxShadow: "0 3px 10px rgba(17,18,20,.10)" }}>
          <div style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, fontSize: 21,
            letterSpacing: 2, lineHeight: 1, whiteSpace: "nowrap" }}>{ed.stamp.a}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: 1, marginTop: 4,
            whiteSpace: "nowrap" }}>{ed.stamp.b}</div>
        </div>

        {/* newsprint show-through — page 2 headline, mirrored, barely there */}
        <div aria-hidden="true" style={{ position: "absolute", top: 392, left: 30, fontFamily: FP_COND,
          fontStretch: "70%", fontWeight: 700, fontSize: 54, textTransform: "uppercase",
          color: "rgba(17,18,20,.05)", transform: "scaleX(-1)", whiteSpace: "nowrap", zIndex: 1,
          letterSpacing: 1 }}>{ed.thru}</div>

        {/* standfirst — real editorial type: UI face, drop cap, end mark */}
        <div className="kg-fp-deck" style={{ position: "absolute", top: 378, left: 20, right: 74, zIndex: 3,
          fontFamily: F_UI, fontSize: 13.5, lineHeight: 1.58, color: FP.body }}>
          {ed.deck}
        </div>

        {/* INSIDE index or the quiet-day IN BRIEF (fed from the real logbook) */}
        {ed.box.kind === "inside" ? (
          <div style={{ position: "absolute", left: 20, right: 74, top: 500, zIndex: 3, border: `1px solid ${FP.ink}`,
            background: FP.conc, padding: "8px 10px", fontFamily: F_MONO, fontSize: 9.5,
            letterSpacing: 0.5, color: FP.mid, whiteSpace: "nowrap" }}>
            <b style={{ color: FP.ink, fontWeight: 700, letterSpacing: 2, marginRight: 8 }}>INSIDE</b>
            {[["mods", "GEAR p.2"], ["logbook", "LOG p.3"], ["manuals", "MANUAL p.4"]].map(([id, label], i) => (
              <span key={id}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <a role="button" tabIndex={0} onClick={() => onNav(id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNav(id); } }}
                  style={{ color: FP.mid, textDecoration: "underline", textUnderlineOffset: 2,
                    textDecorationColor: FP.rule, cursor: "pointer" }}>{label}</a>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ position: "absolute", left: 20, right: 74, top: 486, zIndex: 3, border: `1px solid ${FP.ink}`,
            background: FP.conc, padding: "8px 10px 9px" }}>
            <div style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, fontSize: 13,
              letterSpacing: 2.5, color: FP.ink, borderBottom: `1px solid ${FP.rule}`,
              paddingBottom: 4, marginBottom: 5 }}>{ed.box.title}</div>
            <div style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: 0.5, lineHeight: 1.8, color: FP.mid }}>
              {ed.box.lines.map((l, i) => (
                <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.t} · AT <b style={{ color: FP.ok, fontWeight: 700 }}>{l.at}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* inkan chop nav — its own clear column on the right edge. Each chop now
            carries a visible text label in the gutter (kanji-only squares were
            unguessable — legibility pass 2026-07-25); the whole row is the button. */}
        <nav aria-label="Sections" style={{ position: "absolute", right: 0, top: 378, display: "flex",
          flexDirection: "column", gap: 6, zIndex: 5 }}>
          {VIEWS.map(v => {
            const on = v.id === view;
            return (
              <button key={v.id} className="kg-fp-chop" aria-label={v.label}
                aria-current={on ? "page" : undefined} onClick={() => onNav(v.id)}
                style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
                  background: "transparent" }}>
                <span style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, fontSize: 10,
                  letterSpacing: 1.2, color: on ? ed.accent : FP.mid, textTransform: "uppercase" }}>{v.tab}</span>
                <span aria-hidden="true" style={{ width: 34, height: 34, display: "flex", alignItems: "center",
                  justifyContent: "center", fontFamily: F_KANJI, fontWeight: 700, fontSize: 17,
                  background: on ? ed.accent : FP.ink, color: FP.paper }}>{v.kanji}</span>
              </button>
            );
          })}
        </nav>

        {/* FIG. 1 — the service ramp as the chart of the day */}
        <FpRamp lanes={ed.lanes} post={ed.post} tickKm={ed.tickKm} scale={ed.scale} quiet={quiet} />

        {/* folio foot — the bottom edge resolves in ink */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: FP.ink,
          zIndex: 6, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 14px" }}>
          <span style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: 1.4, color: FP.paper, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: F_KANJI, color: "#c8323b", marginRight: 6, fontSize: 12 }}>鉄</span>
            TETSU GARAGE · GARAGE, p.1
          </span>
          <span style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: 1, color: "#aab0b8", whiteSpace: "nowrap" }}>
            {ed.folioRight}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── THE INNER PAGES — pages 2–4 + the back page of the same edition ──────────
// Read mode for GEAR / LOG / MANUAL / ASK carries the broadsheet through: paper
// ground, ink type, newspaper chrome. Unlike the front page (a fixed 393px art
// board), these are WORKING pages, so they stay fluid — ≥13px body, ≥10px mono,
// 44px tap targets. EDIT flips the paper over onto the dark bench shell.
const PP_PAGES = {
  mods:    { no: "GEAR · p.2",   kicker: "THE GEAR LOCKER —",  head: "ON THE BIKE. AND NEXT.",
             next: ["logbook", "THE LOG BOOK FOLLOWS, p.3 →"] },
  logbook: { no: "LOG · p.3",    kicker: "THE LOG BOOK —",     head: "WORK, ON THE RECORD.",
             next: ["manuals", "THE MANUAL DESK, p.4 →"] },
  manuals: { no: "MANUAL · p.4", kicker: "THE MANUAL DESK —",  head: "LOOK IT UP. TORQUE IT RIGHT.",
             next: ["chat", "THE BACK PAGE →"] },
  chat:    { no: "BACK PAGE",    kicker: "THE BACK PAGE —",    head: "ASK TETSU.",
             next: ["maintenance", "BACK TO THE FRONT PAGE, p.1 →"] },
};

// Print-register status colours for gear on paper (never the neon set).
const PP_STATUS = {
  installed: { color: FP.ok,    label: "INSTALLED" },
  stock:     { color: FP.ink,   label: "STOCK" },
  planned:   { color: FP.brass, label: "PLANNED" },
  wishlist:  { color: FP.mid,   label: "WISHLIST" },
};

// Fresh-page input register — square, ink-ruled, black type on near-white.
const PP_PAGE_BG = "#faf9f4";
const ppInput = {
  background: PP_PAGE_BG, border: `1.5px solid ${FP.ink}`, borderRadius: 0,
  color: FP.ink, fontSize: 14, padding: "11px 12px", outline: "none", width: "100%",
};

// EDIT mode heads — the composing room. Same paper, sleeves rolled up.
const PP_EDIT = {
  maintenance: { kicker: "THE COMPOSING ROOM —", head: "SET THE BENCH.", no: "EDITING · p.1",
    deck: "The unit, the odometer, the intervals and the bench reference. Everything saves itself — press DONE to print the page." },
  mods:        { kicker: "THE COMPOSING ROOM —", head: "REWRITE THE LOCKER.", no: "EDITING · p.2",
    deck: "What's on the bike, what's in the drawer, what's still circled. Everything saves itself — press DONE to print the page." },
  logbook:     { kicker: "THE COMPOSING ROOM —", head: "FILE THE RECORD.", no: "EDITING · p.3",
    deck: "Log work as you did it. Tags are comma-separated. Everything saves itself — press DONE to print the page." },
  manuals:     { kicker: "THE COMPOSING ROOM —", head: "STOCK THE SHELF.", no: "EDITING · p.4",
    deck: "Your reference shelf. Torque specs are set on the bench page. Everything saves itself — press DONE to print the page." },
};

// ── Inner-page chrome — running head, section tabs, mobile folio bar ─────────
function PaperChrome({ view, editing, onNav, onEdit, onExit, save, now, children }) {
  return (
    <div className="kg-pp" data-kg-component="tetsu-innerpage" data-kg-owner="kg"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        background: FP.paper, color: FP.ink }}>

      {/* running head — the edition's inner-page masthead strip */}
      <header style={{ flexShrink: 0, borderBottom: `3px solid ${FP.ink}`, background: FP.paper, zIndex: 3 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "11px 0 9px" }}>
            <a role="button" tabIndex={0} aria-label="Front page" onClick={() => onNav("maintenance")}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNav("maintenance"); } }}
              style={{ display: "flex", alignItems: "baseline", gap: 9, cursor: "pointer", minWidth: 0 }}>
              <span aria-hidden="true" style={{ fontFamily: F_KANJI, fontWeight: 700, fontSize: 17,
                color: "#c8323b", lineHeight: 1 }}>鉄</span>
              <span style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, fontSize: 17,
                letterSpacing: 2, textTransform: "uppercase", color: FP.ink, whiteSpace: "nowrap" }}>
                Tetsu Garage</span>
              <span className="kg-pp-date" style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1,
                color: FP.mid, whiteSpace: "nowrap" }}>{fpDateShort(now)}</span>
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span className="kg-pp-save" style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 0.8,
                color: save.bad ? FP.due : FP.mid, whiteSpace: "nowrap" }}>{save.text}</span>
              <button className="kg-pp-btn" onClick={onEdit}
                style={{ background: editing ? FP.due : FP.ink, color: FP.paper, border: "none", cursor: "pointer",
                  fontFamily: F_MONO, fontWeight: 700, fontSize: 11, letterSpacing: 2, padding: "9px 15px" }}>
                {editing ? "DONE" : "EDIT"}
              </button>
              {onExit && (
                <button className="kg-pp-btn" onClick={onExit}
                  style={{ background: "transparent", color: FP.mid, border: `1.5px solid ${FP.rule}`,
                    cursor: "pointer", fontFamily: F_MONO, fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
                    padding: "8px 12px" }}>
                  ← BACK
                </button>
              )}
            </div>
          </div>
          {/* section tabs — the paper's section index; also the desktop nav */}
          <nav className="kg-pp-tabs" aria-label="Sections"
            style={{ display: "flex", borderTop: `1px solid ${FP.rule}`, overflowX: "auto" }}>
            {VIEWS.map(v => {
              const on = v.id === view;
              return (
                <button key={v.id} className="kg-pp-tab" aria-current={on ? "page" : undefined}
                  onClick={() => onNav(v.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 16px", minHeight: 44,
                    border: "none", background: on ? FP.ink : "transparent", color: on ? FP.paper : FP.ink,
                    cursor: "pointer", fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700,
                    fontSize: 13.5, letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  <span aria-hidden="true" style={{ fontFamily: F_KANJI, fontSize: 13,
                    color: on ? FP.paper : FP.stone }}>{v.kanji}</span>
                  {v.tab}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* the page itself */}
      <main className="kg-pp-main" style={{ flex: 1, minHeight: 0, overflowY: "auto",
        backgroundImage: "repeating-linear-gradient(180deg,rgba(17,18,20,.024) 0 1px,transparent 1px 54px),repeating-linear-gradient(90deg,rgba(17,18,20,.014) 0 1px,transparent 1px 3px)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 18px 90px" }}>
          {children}
          {/* folio foot — every page hands off to the next one (read mode only;
              the composing room ends at DONE, not at the next page) */}
          {(() => {
            const meta = editing ? null : PP_PAGES[view];
            return meta ? (
              <div style={{ marginTop: 40, borderTop: `3px solid ${FP.ink}`, paddingTop: 10,
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.4, color: FP.mid }}>
                  TETSU GARAGE · {meta.no}
                </span>
                <a role="button" tabIndex={0} onClick={() => onNav(meta.next[0])}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNav(meta.next[0]); } }}
                  style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1, color: FP.ink, cursor: "pointer",
                    textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: FP.rule }}>
                  {meta.next[1]}
                </a>
              </div>
            ) : null;
          })()}
        </div>
      </main>

      {/* mobile folio bar — the ink foot doubles as section nav on the phone */}
      <nav className="kg-pp-bottomnav" aria-label="Sections">
        {VIEWS.map(v => {
          const on = v.id === view;
          return (
            <button key={v.id} aria-current={on ? "page" : undefined} onClick={() => onNav(v.id)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "9px 2px 7px", border: "none", cursor: "pointer",
                background: on ? FP.paper : "transparent", color: on ? FP.ink : FP.paper }}>
              <span aria-hidden="true" style={{ fontFamily: F_KANJI, fontWeight: 700, fontSize: 16,
                lineHeight: 1 }}>{v.kanji}</span>
              <span style={{ fontFamily: F_MONO, fontSize: 8.5, letterSpacing: 1 }}>{v.tab}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Page head — kicker, headline, folio, standfirst ──────────────────────────
function PpHead({ view, note, standfirst, meta: override }) {
  const meta = override || PP_PAGES[view];
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: 2.6, fontWeight: 700, color: FP.ink }}>
          {meta.kicker}
        </span>
        <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.2, color: FP.mid, whiteSpace: "nowrap" }}>
          {note ? `${note} · ` : ""}{meta.no}
        </span>
      </div>
      <h2 style={{ margin: "6px 0 0", fontFamily: FP_COND, fontStretch: "70%", fontWeight: 700,
        textTransform: "uppercase", lineHeight: 0.92, color: FP.ink, letterSpacing: 0,
        fontSize: "clamp(34px, 6.4vw, 54px)" }}>
        {meta.head}
      </h2>
      {standfirst && (
        <p style={{ margin: "12px 0 0", fontFamily: F_UI, fontSize: 14.5, lineHeight: 1.6,
          color: FP.body, maxWidth: 640 }}>{standfirst}</p>
      )}
      <div style={{ marginTop: 16, borderBottom: `1px solid ${FP.rule}` }} />
    </div>
  );
}

// ── GEAR — p.2, the gear locker set as a printed catalog ─────────────────────
function GearPage({ mods, edit }) {
  const [linkDraft, setLinkDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const submitLink = async () => {
    const v = linkDraft.trim();
    if (!v || adding) return;
    setAdding(true);
    let image = "", title = "", price = "";
    try {
      const r = await fetch(`/api/link-preview?url=${encodeURIComponent(v)}`);
      if (r.ok) { const d = await r.json(); image = d.image || ""; title = d.title || ""; price = d.price || ""; }
    } catch { /* preview is best-effort — never block the capture */ }
    edit.addRow("mods", { id: `m${Date.now()}`, part: title || hostFromUrl(v), category: "", link: v,
      image, date: "", cost: price, status: "planned", note: "" });
    setLinkDraft(""); setAdding(false);
  };

  const counts = st => (mods || []).filter(m => (m.status || "installed") === st);
  const standfirst = mods.length
    ? `${counts("installed").length} parts on the bike, ${counts("stock").length} in the drawer — ` +
      `${counts("planned").length + counts("wishlist").length} still circled in the catalog.`
    : "Nothing in the locker yet — paste a product link below and the catalog starts itself.";

  return (
    <div>
      <PpHead view="mods" note={`${mods.length} ITEMS`} standfirst={standfirst} />

      {/* the ledger — one ruled strip, four columns */}
      <div className="kg-pp-ledger" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        border: `1.5px solid ${FP.ink}`, background: PP_PAGE_BG, marginBottom: 20 }}>
        {["installed", "stock", "planned", "wishlist"].map((st, i) => {
          const meta = PP_STATUS[st];
          const items = counts(st);
          return (
            <div key={st} style={{ padding: "10px 14px 11px", borderLeft: i > 0 ? `1px solid ${FP.rule}` : "none" }}>
              <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.6, fontWeight: 700, color: meta.color }}>
                {st === "stock" ? "STOCK · OWNED" : meta.label}
              </div>
              <div style={{ fontFamily: FP_COND, fontStretch: "72%", fontWeight: 700, fontSize: 24,
                color: FP.ink, marginTop: 3, lineHeight: 1 }}>
                {sumCosts(items)}
              </div>
              <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 0.8, color: FP.mid, marginTop: 4 }}>
                {items.length} PART{items.length === 1 ? "" : "S"}
              </div>
            </div>
          );
        })}
      </div>

      {/* quick-add — the classified desk takes a link, prints it as PLANNED */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitLink(); } }}
            placeholder="https://… paste a product link"
            style={{ ...ppInput, fontFamily: F_MONO, fontSize: 13, flex: 1 }} />
          <button className="kg-pp-btn" onClick={submitLink} disabled={!linkDraft.trim() || adding}
            style={{ background: (!linkDraft.trim() || adding) ? FP.conc : FP.ink,
              color: (!linkDraft.trim() || adding) ? FP.stone : FP.paper, border: "none",
              fontFamily: F_MONO, fontWeight: 700, fontSize: 12, letterSpacing: 2, padding: "0 20px",
              cursor: (!linkDraft.trim() || adding) ? "default" : "pointer", flexShrink: 0 }}>
            {adding ? "…" : "ADD"}
          </button>
        </div>
        <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 0.5, color: FP.mid, marginTop: 7 }}>
          IT LANDS AS PLANNED — SET THE STATUS ON THE PLATE. EVERYTHING SAVES ITSELF.
        </div>
      </div>

      {/* the plates — printed catalog cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
        {mods.map((mod, i) => {
          const meta = PP_STATUS[mod.status] || PP_STATUS.installed;
          return (
            <div key={mod.id || `${mod.part}-${i}`} className="kg-pp-plate"
              style={{ background: PP_PAGE_BG, border: `1px solid ${FP.rule}`,
                borderTop: `3px solid ${meta.color}`, display: "flex", flexDirection: "column" }}>
              {mod.image && (
                <img src={mod.image} alt={mod.part} loading="lazy"
                  onError={e => { e.currentTarget.style.display = "none"; }}
                  style={{ display: "block", width: "100%", height: 150, objectFit: "cover",
                    background: FP.conc, borderBottom: `1px solid ${FP.rule}` }} />
              )}
              <div style={{ padding: "12px 14px 0", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <InlineName paper value={mod.part} onCommit={v => edit.updRow("mods", i, "part", v)} />
                  </div>
                  <span style={{ flexShrink: 0, transform: "rotate(-2deg)", border: `2px solid ${meta.color}`,
                    color: meta.color, fontFamily: F_MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: 1.4,
                    padding: "2px 6px", marginTop: 2 }}>{meta.label}</span>
                </div>
                {mod.category && (
                  <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.6, color: FP.mid,
                    textTransform: "uppercase", marginTop: 5 }}>{mod.category}</div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 14px",
                  marginTop: 10 }}>
                  {mod.cost && <span style={{ fontFamily: FP_COND, fontStretch: "72%", fontWeight: 700,
                    fontSize: 18, color: FP.ink }}>{mod.cost}</span>}
                  {mod.date && <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: FP.mid }}>{mod.date}</span>}
                  {mod.link && (
                    <a href={mod.link} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: F_MONO, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: FP.ink,
                        textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: FP.rule }}>
                      VIEW PART ↗</a>
                  )}
                </div>
                {mod.note && (
                  <div style={{ fontFamily: F_UI, fontSize: 13, color: FP.body, lineHeight: 1.55,
                    marginTop: 9 }}>{mod.note}</div>
                )}
              </div>
              {/* status toggle — four full-width print buttons, 40px tall */}
              <div style={{ display: "flex", borderTop: `1px solid ${FP.rule}`, marginTop: 12 }}>
                {["installed", "stock", "planned", "wishlist"].map((v, j) => {
                  const on = (mod.status || "installed") === v;
                  const c = PP_STATUS[v].color;
                  return (
                    <button key={v} onClick={() => edit.updRow("mods", i, "status", v)}
                      style={{ flex: 1, minHeight: 40, border: "none",
                        borderLeft: j > 0 ? `1px solid ${FP.rule}` : "none",
                        background: on ? c : "transparent", color: on ? FP.paper : FP.mid,
                        fontFamily: F_MONO, fontWeight: 700, fontSize: 9.5, letterSpacing: 0.8,
                        cursor: "pointer", padding: "0 2px" }}>
                      {v.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {mods.length === 0 && (
        <div style={{ fontFamily: F_UI, fontSize: 14, color: FP.body, padding: "26px 0" }}>
          No parts on file. Paste a link above, or press EDIT for the full form.
        </div>
      )}
    </div>
  );
}

// ── LOG — p.3, the logbook set as dated column reports ───────────────────────
function LogPage({ entries }) {
  const standfirst = entries.length
    ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}, newest first — every wrench on the record.`
    : "The record is blank. The first wrench makes the news.";
  return (
    <div>
      <PpHead view="logbook" note={`${entries.length} ENTRIES`} standfirst={standfirst} />
      {entries.length === 0 && (
        <div style={{ fontFamily: F_UI, fontSize: 14, color: FP.body, padding: "26px 0" }}>
          No entries logged yet. Press EDIT to file the first one.
        </div>
      )}
      <div>
        {entries.map((e, i) => (
          <article key={`${e.date}-${i}`} className="kg-pp-logrow"
            style={{ display: "flex", gap: 20, padding: "18px 0",
              borderBottom: `1px solid ${FP.rule}` }}>
            {/* dateline block */}
            <div style={{ flexShrink: 0, width: 104 }}>
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 1, color: FP.mid }}>{e.date || "—"}</div>
              <div style={{ fontFamily: FP_COND, fontStretch: "72%", fontWeight: 700, fontSize: 20,
                color: FP.ink, marginTop: 3, lineHeight: 1 }}>{fmtKm(e.odo)}</div>
              <div style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: 1, color: FP.mid, marginTop: 2 }}>KM</div>
            </div>
            {/* report body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontFamily: FP_COND, fontStretch: "72%", fontWeight: 700,
                textTransform: "uppercase", fontSize: 19, lineHeight: 1.05, color: FP.ink }}>{e.title}</h3>
              {(e.tags || []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {e.tags.map(t => (
                    <span key={t} style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.2,
                      textTransform: "uppercase", color: FP.mid, background: FP.conc,
                      border: `1px solid ${FP.rule}`, padding: "2px 7px" }}>{t}</span>
                  ))}
                </div>
              )}
              {e.note && (
                <p style={{ margin: "9px 0 0", fontFamily: F_UI, fontSize: 13.5, lineHeight: 1.6,
                  color: FP.body, maxWidth: 560 }}>{e.note}</p>
              )}
              {e.photo && (
                <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1, color: FP.mid, marginTop: 8 }}>
                  PLATE · {e.photo}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── MANUAL — p.4, the shelf as an index + the reader on fresh paper ──────────
function ManualPage({ manuals }) {
  const standfirst = "The workshop shelf, and the full 2013 Sportster manual — open a chapter or search the lot.";
  return (
    <div>
      <PpHead view="manuals" note={`${manuals.length} SOURCES`} standfirst={standfirst} />

      {/* the shelf — an index, one ruled row per source */}
      <div style={{ border: `1.5px solid ${FP.ink}`, background: PP_PAGE_BG, marginBottom: 30 }}>
        {manuals.map((mn, i) => (
          <div key={`${mn.title}-${i}`} className="kg-pp-shelfrow"
            style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "11px 14px",
              borderTop: i > 0 ? `1px solid ${FP.rule}` : "none", flexWrap: "wrap" }}>
            <span style={{ flexShrink: 0, fontFamily: F_MONO, fontWeight: 700, fontSize: 10,
              letterSpacing: 1.4, color: FP.paper, background: FP.ink, padding: "2px 7px" }}>{mn.type || "REF"}</span>
            <span style={{ fontFamily: FP_COND, fontStretch: "75%", fontWeight: 700, fontSize: 16,
              color: FP.ink }}>{mn.title}</span>
            {mn.ref && <span style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 0.8, color: FP.mid }}>{mn.ref}</span>}
            {mn.note && <span style={{ fontFamily: F_UI, fontSize: 13, color: FP.body, flex: "1 1 240px" }}>{mn.note}</span>}
          </div>
        ))}
        {manuals.length === 0 && (
          <div style={{ padding: "14px 16px", fontFamily: F_UI, fontSize: 14, color: FP.body }}>
            The shelf is empty — press EDIT to add a source.
          </div>
        )}
      </div>

      <ManualReader paper />
    </div>
  );
}

// ── ASK — the back page, wired to the same lifted chat state ─────────────────
function AskPage({ messages, input, setInput, busy, onSend }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 320px)" }}>
      <PpHead view="chat" note={`${messages.length} MESSAGES`}
        standfirst="Service, specs, mods, torque — straight to the wrench." />

      {/* the correspondence column */}
      <div style={{ flex: 1, minHeight: 300, overflowY: "auto", border: `1.5px solid ${FP.ink}`,
        background: PP_PAGE_BG, padding: "18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 10, textAlign: "center", padding: "30px 0" }}>
            <span aria-hidden="true" style={{ fontFamily: F_KANJI, fontWeight: 700, fontSize: 52,
              lineHeight: 1, color: FP.ink, opacity: 0.08 }}>鉄</span>
            <span style={{ fontFamily: F_UI, fontSize: 13.5, color: FP.body, maxWidth: 360, lineHeight: 1.6 }}>
              Ask Tetsu about the Forty-Eight — service, specs, mods, torque. The bench writes back.
            </span>
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const showLabel = !isUser && (i === 0 || messages[i - 1].role !== "tetsu");
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column",
              alignItems: isUser ? "flex-end" : "flex-start" }}>
              {showLabel && (
                <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 2, color: FP.mid, marginBottom: 5 }}>
                  <span aria-hidden="true" style={{ fontFamily: F_KANJI, color: "#c8323b", marginRight: 5 }}>鉄</span>
                  FROM THE BENCH
                </span>
              )}
              <div style={{ maxWidth: "78%", fontFamily: F_UI, fontSize: 14, lineHeight: 1.6,
                whiteSpace: "pre-wrap", padding: "10px 13px",
                background: isUser ? FP.conc : "transparent",
                border: isUser ? `1px solid ${FP.rule}` : "none",
                borderLeft: isUser ? `1px solid ${FP.rule}` : `3px solid ${FP.ink}`,
                color: isUser ? FP.ink : FP.body }}>
                {m.text}
              </div>
            </div>
          );
        })}
        {busy && (
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: 1, color: FP.mid, alignSelf: "flex-start" }}>
            鉄 THE BENCH IS ON IT…
          </div>
        )}
      </div>

      {/* the reply slip */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexShrink: 0 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Ask the bench…" rows={1}
          style={{ ...ppInput, fontFamily: F_UI, flex: 1, resize: "none", minHeight: 44, maxHeight: 120,
            lineHeight: 1.45 }} />
        <button className="kg-pp-btn" onClick={onSend} disabled={busy || !input.trim()}
          style={{ background: (busy || !input.trim()) ? FP.conc : FP.ink,
            color: (busy || !input.trim()) ? FP.stone : FP.paper, border: "none",
            fontFamily: F_MONO, fontWeight: 700, fontSize: 12, letterSpacing: 2, padding: "0 20px",
            cursor: (busy || !input.trim()) ? "default" : "pointer", flexShrink: 0 }}>
          SEND
        </button>
      </div>
    </div>
  );
}

export default function TetsuSurface({ onExit }) {
  const [garage, setGarage] = useState(null);       // full { bikes, fluids, ... } payload
  const [source, setSource] = useState("");          // 'seed' | 'corpus' | 'offline' | …
  const [loaded, setLoaded] = useState(false);
  const [view, setView]     = useState("maintenance"); // active main-pane segment
  const [editing, setEditing] = useState(false);     // EDIT mode — inline forms on every section
  // Auto-save revision model: every edit bumps `rev`; a completed save records the rev it
  // persisted into `savedRev`. dirty = rev !== savedRev. This survives an edit landing mid-save
  // (the save records only the rev it captured, so the newer edit stays dirty and re-saves).
  const [rev, setRev]         = useState(0);         // bumped on every edit
  const [savedRev, setSavedRev] = useState(0);       // last rev successfully persisted
  const [retry, setRetry]     = useState(0);         // nudges the auto-save effect to retry after a failure
  const [saving, setSaving]   = useState(false);     // POST in flight
  const [saveMsg, setSaveMsg] = useState("");        // transient save feedback ("saved" | "save failed")
  const dirty = rev !== savedRev;                    // derived — unsaved edits pending

  // ASK TETSU chat state — lifted here (not into ChatView) so the conversation
  // survives switching tabs; it would reset on unmount if it lived in the view.
  const [chatMsgs, setChatMsgs]   = useState([]);   // [{ role:"user"|"tetsu", text }]
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy]   = useState(false);

  // "Now" is captured once so status scoring is stable across re-renders.
  const now = useMemo(() => new Date(), []);

  // Send the composed message to the real Tetsu operative via the shared chat
  // endpoint. Reply/error come straight from the backend — no local canned text.
  async function sendTetsuMessage() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatMsgs(prev => [...prev, { role: "user", text }]);
    setChatInput("");
    setChatBusy(true);
    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agentId: "TETSU" }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || "No response.";
      setChatMsgs(prev => [...prev, { role: "tetsu", text: reply }]);
    } catch {
      setChatMsgs(prev => [...prev, { role: "tetsu", text: "Connection error: is the server running?" }]);
    } finally {
      setChatBusy(false);
    }
  }

  // Load the garage. API first; committed seed as the offline fallback so the
  // shell is never empty even if kg-api is down.
  useEffect(() => {
    let alive = true;
    API_GET("/api/garage")
      .then(d => {
        if (!alive) return;
        setGarage(d);
        setSource(d.source || "");
      })
      .catch(() => {
        if (!alive) return;
        setGarage(FALLBACK);
        setSource("offline");
      })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  // ── Editing — mutate the in-memory garage, then persist to the personal corpus.
  // Every edit deep-clones so React re-renders and marks the surface dirty; SAVE
  // POSTs the whole payload to /api/garage (writes _output/tetsu/garage.json).
  const EMPTY = { bikes: [], fluids: [], schedule: [], log: [], mods: [], manuals: [], torque: [], torqueNote: "" };
  function updateGarage(mutator) {
    setGarage(prev => {
      const next = prev ? JSON.parse(JSON.stringify(prev)) : { ...EMPTY };
      mutator(next);
      return next;
    });
    setRev(r => r + 1);   // marks dirty; the debounced effect auto-saves shortly after
    setSaveMsg("");
  }
  const updBike = (field, val) => updateGarage(g => { if (!Array.isArray(g.bikes) || !g.bikes.length) g.bikes = [{}]; g.bikes[0][field] = val; });
  const updRow  = (list, i, field, val) => updateGarage(g => { g[list][i][field] = val; });
  const addRow  = (list, tmpl) => updateGarage(g => { if (!Array.isArray(g[list])) g[list] = []; g[list].push({ ...tmpl }); });
  const delRow  = (list, i) => updateGarage(g => { g[list].splice(i, 1); });

  // Latest garage + rev, read inside the debounced save so it never persists a stale snapshot.
  const garageRef = useRef(garage);
  const revRef    = useRef(rev);
  useEffect(() => { garageRef.current = garage; revRef.current = rev; }, [garage, rev]);

  async function saveGarage() {
    if (saving) return;
    const g = garageRef.current;
    const target = revRef.current;          // the rev this write persists
    setSaving(true); setSaveMsg("");
    try {
      const payload = {
        bikes: (g && g.bikes) || [], fluids: (g && g.fluids) || [],
        schedule: (g && g.schedule) || [], log: (g && g.log) || [],
        mods: (g && g.mods) || [], manuals: (g && g.manuals) || [],
        torque: (g && g.torque) || [], torqueNote: (g && g.torqueNote) || "",
      };
      const res  = await fetch("/api/garage", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSavedRev(target);                  // only this rev is clean; a newer edit stays dirty → re-saves
      setSource("corpus"); setSaveMsg("saved");
    } catch {
      setSaveMsg("save failed");
      setTimeout(() => setRetry(n => n + 1), 2500);  // nudge the effect to retry
    } finally {
      setSaving(false);
    }
  }

  // Auto-save — persist ~700ms after the last edit (debounced). No SAVE button: any change
  // to the garage (edit forms, odometer, inline status, quick-add) is written automatically.
  useEffect(() => {
    if (!loaded || saving || rev === savedRev) return;
    const t = setTimeout(() => { saveGarage(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, savedRev, loaded, saving, retry]);

  const bikes    = (garage && garage.bikes)    || [];
  const fluids   = (garage && garage.fluids)   || [];
  const schedule = (garage && garage.schedule) || [];
  const log      = (garage && garage.log)      || [];
  const mods     = (garage && garage.mods)     || [];
  const manuals  = (garage && garage.manuals)  || [];
  const torque   = (garage && garage.torque)   || [];
  const torqueNote = (garage && garage.torqueNote) || "";
  const bike = bikes[0] || null;

  // Live odometer — now sourced from the bike record and persisted on SAVE.
  const odo = (bike && Number.isFinite(bike.odometer)) ? bike.odometer : 0;

  // Bundle passed to each view so edit affordances render inline when EDIT is on.
  const edit = { on: editing, updRow, addRow, delRow };

  // Score every schedule item against the live odometer, then sort DUE → SOON → OK.
  const scored = useMemo(() => {
    return schedule
      .map(s => ({ ...s, status: computeStatus(s, odo, now) }))
      .sort((a, b) => RANK[a.status.level] - RANK[b.status.level]);
  }, [schedule, odo, now]);

  const attention = scored.filter(s => s.status.level !== "ok").length;

  // Log entries, newest date first (data may not be pre-sorted).
  const logSorted = useMemo(
    () => [...log].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [log]
  );

  // Oil-life dial source — the engine-oil schedule item, already scored against
  // the live odometer. Derived from existing garage data only (no new endpoint).
  const oilItem = scored.find(s => (s.id === "oil" || /oil/i.test(s.task || "")) && s.intervalKm != null) || null;

  // FRONT PAGE — the GARAGE display path is the broadsheet. The other sections'
  // READ paths are inner pages of the same edition (PaperChrome); EDIT mode is
  // the only door back onto the classic dark bench shell.
  const front = loaded && view === "maintenance" && !editing;
  const paper = loaded && view !== "maintenance" && !editing;
  const bench = loaded && editing;   // the composing room — EDIT, also on paper

  // Save-state line for the paper running head (mono, print register).
  const ppSave = (() => {
    if (!loaded)                    return { text: "LOADING…", bad: false };
    if (saving || dirty)            return { text: "SAVING…", bad: false };
    if (saveMsg === "save failed")  return { text: "SAVE FAILED — RETRYING", bad: true };
    return { text: "SAVED", bad: false };
  })();

  return (
    <div className="kg-tetsu" data-kg-component="tetsu-surface" data-kg-owner="kg"
      style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex", flexDirection: "column", overflow: "hidden",
        background: INK,
        backgroundImage: "var(--tt-grain)",
        color: BONE_DIM, fontFamily: F_UI, lineHeight: 1.5 }}>
      <style>{`
        /* ── Tetsu metal brand vars — dark grounds (dim + dark themes) ──
           The page GROUND + body TEXT come from the shared --kg-* tokens; these
           --tt-* vars carry only the monochrome-metal brand decoration. */
        .kg-tetsu{
          /* Size the app shell to the DYNAMIC viewport so the flex-child bottom
             tab bar anchors to the TRUE visible bottom on mobile (dvh follows the
             browser toolbars; svh/vh are progressive fallbacks for old engines). */
          height:100vh; height:100svh; height:100dvh;
          --tt-navh:56px;
          /* Ground + text tokens — standalone fork owns these. In the kage-gumi
             monorepo the --kg-* theme tokens were provided globally; forked out
             on their own they were undefined, so every ground/border resolved to
             transparent and text to default black (a white page with a solid
             black kanji). Defined here as the murdered-out graphite ground the
             monochrome-metal brand was designed against. */
          --kg-bg-deep:#0d0e10; --kg-bg-page:#141518; --kg-bg-card:#1a1c1f; --kg-bg-card-alt:#1f2227;
          --kg-border:#2a2d32; --kg-border-strong:#3b3f45;
          --kg-text:#eceef1; --kg-text-body:#c4c8cd; --kg-text-muted:#8b9097; --kg-text-faint:#565a61;
          --kg-watermark-opacity:.05;
          --tt-chrome:#d7dae0; --tt-steel:#9aa0a8; --tt-steel-dim:#6b7078; --tt-raise:#2c2e33;
          --tt-due:#c85a5f; --tt-soon:#b7935a; --tt-ok:var(--kg-text-muted);
          --tt-grad:linear-gradient(180deg,#ffffff 0%,#e9e4d9 20%,#9fa4ac 48%,#c9ccd2 58%,#70747b 100%);
          --tt-grad-shadow:rgba(0,0,0,.6);
          --tt-seg-on:linear-gradient(180deg,#e9e4d9,#c7c3b8);
          --tt-seg-on-text:#15130f;
          --tt-rivet-hi:#5b5e66; --tt-rivet-lo:#16171a; --tt-rivet-ring:rgba(0,0,0,.85);
          --tt-hairline:linear-gradient(90deg,transparent,#cfd3da 25%,#6c7075 50%,#cfd3da 75%,transparent);
          --tt-grain:repeating-linear-gradient(90deg,rgba(255,255,255,.012) 0 1px,transparent 1px 3px);
          --tt-card-shadow:0 8px 26px rgba(0,0,0,.55);
          --tt-odo-inset:inset 0 3px 5px rgba(0,0,0,.45),inset 0 -3px 5px rgba(0,0,0,.45);
        }
        /* light (washi) ground — the metal flips to dark machined steel so the
           brand survives on paper; statuses deepen for legibility. */
        [data-theme="light"] .kg-tetsu{
          --tt-chrome:#4b5158; --tt-steel:#5d646c; --tt-steel-dim:#767b82; --tt-raise:#dcd8cb;
          --tt-due:#a83a40; --tt-soon:#8a6a33; --tt-ok:#6f6d66;
          --tt-grad:linear-gradient(180deg,#2b2f34 0%,#4b5158 34%,#82888f 50%,#3a3f45 62%,#181a1d 100%);
          --tt-grad-shadow:rgba(255,255,255,.55);
          --tt-seg-on:linear-gradient(180deg,#3a3f45,#24272b);
          --tt-seg-on-text:#efe9dd;
          --tt-rivet-hi:#c2c6cc; --tt-rivet-lo:#7c8188; --tt-rivet-ring:rgba(60,50,35,.35);
          --tt-hairline:linear-gradient(90deg,transparent,#5a5f66 25%,#9aa0a8 50%,#5a5f66 75%,transparent);
          --tt-grain:repeating-linear-gradient(90deg,rgba(42,38,32,.02) 0 1px,transparent 1px 3px);
          --tt-card-shadow:0 4px 14px rgba(60,50,35,.16);
          --tt-odo-inset:inset 0 2px 4px rgba(60,50,35,.20),inset 0 -2px 4px rgba(60,50,35,.20);
        }
        @keyframes ttFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ttPop{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}
        .kg-tetsu *{box-sizing:border-box;}
        .kg-tetsu ::-webkit-scrollbar{width:6px;height:6px;}
        .kg-tetsu ::-webkit-scrollbar-track{background:${INK};}
        .kg-tetsu ::-webkit-scrollbar-thumb{background:${LINE_STR};border-radius:3px;}
        .kg-tt-card{transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;}
        .kg-tt-card:hover{transform:translateY(-2px);border-color:${mix(CHROME, 35)};box-shadow:var(--tt-card-shadow);}
        .kg-tt-btn{transition:background .15s ease,border-color .15s ease,color .15s ease;cursor:pointer;font-family:${F_UI};}
        .kg-tt-seg{transition:background .15s ease,color .15s ease;cursor:pointer;font-family:${F_COND};}
        @media(prefers-reduced-motion:reduce){
          .kg-tt-card,.kg-tt-btn,.kg-tt-seg{transition:none;}
          .kg-tetsu *,.kg-tetsu *::before,.kg-tetsu *::after{animation:none !important;}
          .kg-tt-card:hover{transform:none;}
        }

        /* ── Responsive rework (2026-07-21) ───────────────────────────────
           This surface was forked from a desktop-first (~1280px min) dashboard
           and read as unusable on a phone. These breakpoints collapse the
           multi-column bench to a single, thumb-reachable column at ~390px with
           a tablet mid-step — without touching the monochrome-metal identity.
           The surface is styled with inline objects, which win the cascade, so
           the layout overrides below carry !important by necessity. */
        .kg-tetsu main{overflow-x:hidden;}
        /* hover-lift is a mouse affordance; on touch it just leaves stuck states */
        @media(hover:none){ .kg-tt-card:hover{transform:none;box-shadow:none;} }

        /* Tablet and below — stack the 3-bay hero + the manual reader */
        @media(max-width:1024px){
          .kg-tt-main{padding:20px 20px 44px !important;}
          .kg-tt-herogrid{grid-template-columns:1fr !important;}
          .kg-tt-herogrid > div{border-right:none !important;border-bottom:1px solid var(--kg-border);}
          .kg-tt-herogrid > div:last-child{border-bottom:none !important;}
          .kg-tt-reader{flex-direction:column !important;}
          .kg-tt-reader-rail{width:100% !important;flex-direction:row !important;flex-wrap:wrap !important;}
          .kg-tt-reader-rail > button{flex:1 1 auto;min-height:42px;}
          /* two-up garage grids collapse to one shrinkable column.
             minmax(0,1fr) — a bare 1fr is minmax(auto,1fr), so the track grows to
             its content's min-width and a wide no-wrap row still forces overflow. */
          .kg-tt-colgrid{grid-template-columns:minmax(0,1fr) !important;}

          /* ── mobile bottom tab bar — always-visible section nav ── */
          .kg-tt-viewseg{display:none !important;}   /* top segmented control retires below desktop */
          .kg-tt-bottomnav{
            display:flex !important; position:relative;
            background:linear-gradient(0deg, var(--kg-bg-deep), var(--kg-bg-card));
            border-top:1px solid var(--kg-border);
            padding-bottom:env(safe-area-inset-bottom);   /* clear the iOS home indicator */
          }
          /* chrome hairline along the top edge — the brand signature, echoing the header */
          .kg-tt-bottomnav::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;
            background:var(--tt-hairline);pointer-events:none;}
          .kg-tt-tab{
            flex:1 1 0; min-width:0; min-height:var(--tt-navh);
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
            background:transparent; border:none; border-top:2px solid transparent;
            padding:7px 2px 5px; cursor:pointer; color:var(--tt-steel-dim);
            font-family:${F_MONO}; transition:color .15s ease, background .15s ease;
          }
          .kg-tt-tab-k{font-family:${F_KANJI}; font-weight:700; font-size:19px; line-height:1;}
          .kg-tt-tab-l{font-size:9.5px; letter-spacing:1.5px;}
          .kg-tt-tab[aria-current="page"]{color:var(--tt-chrome); border-top-color:var(--tt-chrome);
            background:color-mix(in srgb, var(--tt-chrome) 9%, transparent);}

          /* chat view fits between the header and the bottom bar (dynamic viewport) */
          .kg-tt-chatwrap{
            height:calc(100dvh - var(--tt-navh) - env(safe-area-inset-bottom) - 132px) !important;
            min-height:280px !important;}
        }

        /* Phone — one hand, ~390px */
        @media(max-width:640px){
          .kg-tt-header{padding:0 14px !important;gap:10px;}
          .kg-tt-tagline{display:none !important;}
          .kg-tt-header .kg-tt-btn{min-height:40px;padding:8px 12px !important;}
          .kg-tt-main{padding:16px 14px 40px !important;}

          /* torque/fluids bench rows: let the fastener label shrink + wrap so the
             row's min-content fits a phone card (its no-wrap value stays intact) */
          .kg-tt-refrow{flex-wrap:wrap;}
          .kg-tt-refrow > span:first-child{flex-shrink:1 !important;min-width:0;overflow-wrap:anywhere;}
          .kg-tt-refrow > span:last-child{white-space:normal !important;overflow-wrap:anywhere;}
          /* fluids carry three parts (name/spec/qty) — stack them instead of
             cramming a long spec + qty into one horizontal row */
          .kg-tt-fluidrow{flex-direction:column !important;align-items:flex-start !important;gap:2px !important;}
          .kg-tt-fluidrow > span{width:auto !important;white-space:normal !important;}

          /* edit-form field grids collapse 3/4-up → 2-up */
          .kg-tt-fieldgrid{grid-template-columns:1fr 1fr !important;}

          /* interval rows: drop the status cluster under the task instead of overflowing */
          .kg-tt-introw{flex-wrap:wrap !important;}
          .kg-tt-introw > div:last-child{width:100%;flex-wrap:wrap;justify-content:space-between;padding-top:6px !important;}

          /* odometer steppers — bigger tap targets */
          .kg-tt-odostep button{width:46px !important;height:42px !important;font-size:20px !important;}

          /* mod status toggle — taller segments to tap cleanly */
          .kg-tt-modtoggle{display:flex !important;width:100%;}
          .kg-tt-modtoggle button{flex:1 1 auto;min-height:40px;padding:8px 6px !important;font-size:12px !important;}

          /* manual reading pane taller on the phone */
          .kg-tt-scrollpane{max-height:60vh !important;}

          /* garage header: left-align the state chips once the block stacks */
          .kg-tt-garagehead > div:last-child{align-items:flex-start !important;}

          /* watermark dialled back so it doesn't swamp a small screen */
          .kg-tt-watermark{font-size:min(34vh,220px) !important;top:52px !important;}
        }
        /* ── FRONT PAGE (01 · LATE EDITION) — study classes that need CSS proper ── */
        .kg-fp-deck::first-letter{float:left;font-family:${FP_COND};font-stretch:70%;font-weight:700;
          font-size:48px;line-height:.82;padding:3px 7px 0 0;color:#111214;}
        .kg-fp-red{position:absolute;top:0;bottom:0;left:0;background:#b3232e;
          background-image:repeating-linear-gradient(-45deg,rgba(17,18,20,.22) 0 6px,transparent 6px 12px);}
        .kg-fp-red::after{content:"";position:absolute;right:0;top:0;bottom:0;width:3px;background:#7d1820;}
        .kg-fp-torn{clip-path:polygon(0 0,calc(100% - 8px) 0,100% 12%,calc(100% - 7px) 30%,100% 48%,
          calc(100% - 8px) 62%,100% 80%,calc(100% - 7px) 100%,0 100%);}
        .kg-fp-chop{border:none;cursor:pointer;padding:0;transition:filter .15s ease;}
        .kg-fp-chop:hover{filter:brightness(1.35);}
        /* desktop — the sheet is a centred column, the paper runs full-height around it */
        @media(min-width:640px){
          .kg-fp-sheet{box-shadow:0 0 0 1px #d5d1c6,0 0 60px rgba(17,18,20,.07);}
        }
        /* ── INNER PAGES (p.2–4 + the back page) — paper chrome ── */
        .kg-pp-btn{transition:filter .15s ease;}
        .kg-pp-btn:hover{filter:brightness(1.25);}
        .kg-pp-tab{transition:background .12s ease;}
        .kg-pp-tab:not([aria-current="page"]):hover{background:#e6e3dc !important;}
        .kg-pp-tabs{scrollbar-width:none;}
        .kg-pp-tabs::-webkit-scrollbar{display:none;}
        .kg-pp-plate{box-shadow:0 1px 3px rgba(17,18,20,.05);}
        .kg-pp-bottomnav{display:none;flex-shrink:0;background:#111214;
          padding-bottom:env(safe-area-inset-bottom,0);z-index:6;}
        /* ── THE COMPOSING ROOM — the bench forms, re-registered onto paper ──
           Every colour in the edit stack resolves through a --kg- / --tt- var
           (see .kg-tetsu above), so redefining them here flips the whole form
           tree from graphite to newsprint with no per-component restyling.
           Then: square the corners, kill the metal gradients + neon glow, and
           lift the form type to the working-page floor (>=13px, 40px targets). */
        .kg-pp-edit{
          --kg-bg-deep:#faf9f4; --kg-bg-page:#f4f2ec; --kg-bg-card:#e6e3dc; --kg-bg-card-alt:#faf9f4;
          --kg-border:#d5d1c6; --kg-border-strong:#111214;
          --kg-text:#111214; --kg-text-body:#3a3d42; --kg-text-muted:#4c4f54; --kg-text-faint:#767268;
          --kg-watermark-opacity:.04;
          --tt-chrome:#111214; --tt-steel:#4c4f54; --tt-steel-dim:#767268; --tt-raise:#e6e3dc;
          --tt-due:#b3232e; --tt-soon:#8a6a2f; --tt-ok:#3f6b52;
          --tt-grad:linear-gradient(180deg,#3a3d42,#111214);
          --tt-grad-shadow:rgba(255,255,255,.55);
          --tt-seg-on:#111214; --tt-seg-on-text:#f4f2ec;
          --tt-hairline:linear-gradient(90deg,transparent,#b6b2a7 50%,transparent);
          --tt-grain:none;
          color:#3a3d42;
        }
        /* print register: nothing on paper is rounded, nothing on paper glows */
        .kg-pp-edit *{border-radius:0 !important;box-shadow:none !important;}
        .kg-pp-edit input,.kg-pp-edit textarea,.kg-pp-edit select{
          border-width:1.5px !important;font-size:14px !important;padding:10px 11px !important;}
        .kg-pp-edit button{min-height:40px;}
        /* headings in the composing room print condensed, like the rest of the paper */
        .kg-pp-edit h2,.kg-pp-edit h3{font-stretch:75%;color:#111214;}
        .kg-pp-edit .kg-tt-watermark{display:none;}
        /* the view's own section title + blurb duplicate the page head above it
           (GEAR / LOGBOOK / MANUALS all open with one) — the head speaks for the
           page, so drop the echo. Views that don't open with an h2 are untouched. */
        .kg-pp-edit > div:nth-child(2) > h2:first-child,
        .kg-pp-edit > div:nth-child(2) > h2:first-child + p{display:none;}
        @media(max-width:899px){
          .kg-pp-bottomnav{display:flex;}
          .kg-pp-tabs{display:none !important;}
          .kg-pp-date{display:none;}
          /* the gear ledger folds 4-across → 2×2 with honest rules */
          .kg-pp-ledger{grid-template-columns:1fr 1fr !important;}
          .kg-pp-ledger > div{border-left:none !important;}
          .kg-pp-ledger > div:nth-child(even){border-left:1px solid #d5d1c6 !important;}
          .kg-pp-ledger > div:nth-child(n+3){border-top:1px solid #d5d1c6;}
          /* log datelines ride above the report instead of a cramped side rail */
          .kg-pp-logrow{flex-direction:column;gap:8px !important;}
          .kg-pp-logrow > div:first-child{width:auto !important;display:flex;align-items:baseline;gap:8px;}
        }
      `}</style>

      {front && (
        <FrontPage bike={bike} odo={odo} unit={(bike && bike.unit) || "km"} items={scored}
          entries={logSorted} oilItem={oilItem} now={now} view={view}
          onNav={setView} onEdit={() => setEditing(true)} updBike={updBike} />
      )}

      {paper && (
        <PaperChrome view={view} onNav={setView} onEdit={() => setEditing(true)} onExit={onExit}
          save={ppSave} now={now}>
          {view === "mods"    && <GearPage mods={mods} edit={edit} />}
          {view === "logbook" && <LogPage entries={logSorted} />}
          {view === "manuals" && <ManualPage manuals={manuals} />}
          {view === "chat"    && (
            <AskPage messages={chatMsgs} input={chatInput} setInput={setChatInput}
              busy={chatBusy} onSend={sendTetsuMessage} />
          )}
        </PaperChrome>
      )}

      {/* ── THE COMPOSING ROOM — EDIT mode, on the same paper ──────────────────
             The bench forms are unchanged JSX; every colour they use is already
             a --kg- / --tt- custom property, so `.kg-pp-edit` re-registers the
             whole form stack onto paper by redefining those vars (see the CSS
             block above) instead of restyling several hundred call sites. The
             back page has nothing to compose, so it stays the read column. ── */}
      {bench && (
        <PaperChrome view={view} editing onNav={setView} onEdit={() => setEditing(false)}
          onExit={onExit} save={ppSave} now={now}>
          {view === "chat" ? (
            <AskPage messages={chatMsgs} input={chatInput} setInput={setChatInput}
              busy={chatBusy} onSend={sendTetsuMessage} />
          ) : (
            <div className="kg-pp-edit">
              <PpHead view={view} meta={PP_EDIT[view]} note="EDIT MODE"
                standfirst={(PP_EDIT[view] || {}).deck} />
              {view === "maintenance" && (
                <GarageView bike={bike} editing={editing} updBike={updBike} odo={odo} edit={edit}
                  items={scored} raw={schedule} fluids={fluids} torque={torque} torqueNote={torqueNote}
                  onNote={v => updateGarage(g => { g.torqueNote = v; })}
                  entries={logSorted} attention={attention} oilItem={oilItem} />
              )}
              {view === "mods"    && <ModsView mods={mods} edit={edit} />}
              {view === "logbook" && <LogbookView entries={logSorted} raw={log} edit={edit} />}
              {view === "manuals" && <ManualsView manuals={manuals} edit={edit} />}
            </div>
          )}
        </PaperChrome>
      )}

      {/* boot — the press warming up, already on paper */}
      {!loaded && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: FP.paper, color: FP.mid, fontFamily: F_MONO, fontSize: 12, letterSpacing: 2 }}>
          <span aria-hidden="true" style={{ fontFamily: F_KANJI, color: "#c8323b", marginRight: 9,
            fontSize: 18 }}>鉄</span>
          SETTING THE EDITION…
        </div>
      )}

    </div>
  );
}

// ── Aside spec row — label → value line ──────────────────────────────────────
function SpecRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ fontSize: 12.5, fontFamily: F_MONO, letterSpacing: 1, color: STEEL_DIM,
        width: 62, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: BONE_DIM, lineHeight: 1.4 }}>{value}</span>
    </div>
  );
}

// ── Bike edit form — the GARAGE card's editable twin (odometer stays separate) ─
function BikeEditForm({ bike, updBike }) {
  const b = bike || {};
  return (
    <div style={{ background: GUN2, border: `1px solid ${LINE_STR}`, borderTop: `2px solid ${CHROME}`,
      borderRadius: 12, padding: "14px 14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <EField label="MAKE"><TInput value={b.make} onChange={v => updBike("make", v)} placeholder="Harley-Davidson" /></EField>
      <EField label="MODEL"><TInput value={b.model} onChange={v => updBike("model", v)} placeholder="Forty-Eight" /></EField>
      <EField label="CODE"><TInput value={b.code} onChange={v => updBike("code", v)} placeholder="XL1200X" mono /></EField>
      <EField label="YEAR"><TNum value={b.year} onChange={v => updBike("year", v)} placeholder="2013" /></EField>
      <EField label="ENGINE" span={2}><TInput value={b.engine} onChange={v => updBike("engine", v)} placeholder="Evolution 1202 cc…" /></EField>
      <EField label="DRIVE" span={2}><TInput value={b.drive} onChange={v => updBike("drive", v)} placeholder="Belt final drive · 5-speed" /></EField>
      <EField label="FUEL" span={2}><TInput value={b.fuel} onChange={v => updBike("fuel", v)} placeholder="Petrol 95+…" /></EField>
      <EField label="TYRE F"><TInput value={b.tirePressureFront} onChange={v => updBike("tirePressureFront", v)} placeholder="2.5 bar" mono /></EField>
      <EField label="TYRE R"><TInput value={b.tirePressureRear} onChange={v => updBike("tirePressureRear", v)} placeholder="2.5 bar" mono /></EField>
      <EField label="UNIT"><TInput value={b.unit} onChange={v => updBike("unit", v)} placeholder="km" mono /></EField>
      <EField label="PHOTO" span={2}><BikePhotoField value={b.photo} onChange={v => updBike("photo", v)} /></EField>
      <EField label="NOTES" span={2}><TArea value={b.notes} onChange={v => updBike("notes", v)} placeholder="Anything worth remembering…" rows={3} /></EField>
    </div>
  );
}

// ── Bike photo — upload (downscaled + inlined as a data URL) or paste a URL ─────
function BikePhotoField({ value, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  async function handleFiles(files) {
    const file = files && files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr("That's not an image file."); return; }
    setBusy(true); setErr("");
    try { onChange(await downscaleToDataUrl(file)); }
    catch { setErr("Couldn't read that image, try another file."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value ? (
        <img src={value} alt="Bike" onError={e => { e.currentTarget.style.display = "none"; }}
          style={{ display: "block", width: "100%", height: 120, objectFit: "cover",
            borderRadius: 8, border: `1px solid ${LINE_STR}`, background: BLACK }} />
      ) : (
        <div style={{ height: 120, borderRadius: 8, border: `1px dashed ${LINE_STR}`, background: BLACK,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: FAINT, fontSize: 13, fontFamily: F_MONO, letterSpacing: 1 }}>
          NO PHOTO
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="kg-tt-btn" disabled={busy}
          onClick={() => inputRef.current && inputRef.current.click()}
          style={{ flex: 1, background: mix(CHROME, 7), border: `1px solid ${mix(CHROME, 33)}`, borderRadius: 6,
            color: BONE_DIM, fontSize: 13, fontFamily: F_MONO, fontWeight: 700, letterSpacing: 1,
            padding: "8px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "PROCESSING…" : value ? "REPLACE PHOTO" : "UPLOAD PHOTO"}
        </button>
        {value && (
          <button type="button" className="kg-tt-btn" onClick={() => onChange("")}
            style={{ background: mix(DUE, 8), border: `1px solid ${mix(DUE, 33)}`, borderRadius: 6, color: DUE,
              fontSize: 13, fontFamily: F_MONO, fontWeight: 700, letterSpacing: 1, padding: "8px 12px",
              cursor: "pointer" }}>
            REMOVE
          </button>
        )}
      </div>
      <input value={value && value.startsWith("data:") ? "" : (value || "")}
        onChange={e => onChange(e.target.value)}
        placeholder={value && value.startsWith("data:") ? "uploaded image stored" : "…or paste an image URL"}
        disabled={!!(value && value.startsWith("data:"))}
        style={{ background: BLACK, border: `1px solid ${LINE_STR}`, borderRadius: 6, color: STEEL,
          fontSize: 13, fontFamily: F_MONO, padding: "6px 9px", width: "100%", outline: "none",
          opacity: value && value.startsWith("data:") ? 0.5 : 1 }} />
      {err && <span style={{ fontSize: 12.5, fontFamily: F_MONO, color: DUE }}>{err}</span>}
    </div>
  );
}

// ── Edit primitives — Tetsu-palette inputs reused across every editable section ─
const inputBase = {
  background: BLACK, border: `1px solid ${LINE_STR}`, borderRadius: 6, color: BONE,
  fontSize: 13.5, padding: "6px 9px", width: "100%", outline: "none",
};
function TInput({ value, onChange, placeholder, mono, style }) {
  return (
    <input value={value ?? ""} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, fontFamily: mono ? F_MONO : F_UI, ...style }} />
  );
}
function TArea({ value, onChange, placeholder, rows = 2, style }) {
  return (
    <textarea value={value ?? ""} placeholder={placeholder} rows={rows} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, fontFamily: F_UI, resize: "vertical", lineHeight: 1.5, ...style }} />
  );
}
// Number input — emits a Number, or null when cleared if allowNull (for "no interval").
function TNum({ value, onChange, placeholder, allowNull, style }) {
  return (
    <input type="number" inputMode="numeric" placeholder={placeholder}
      value={value == null ? "" : value}
      onChange={e => { const v = e.target.value; onChange(v === "" ? (allowNull ? null : 0) : Number(v)); }}
      style={{ ...inputBase, fontFamily: F_MONO, ...style }} />
  );
}
function TSelect({ value, onChange, options, style }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, fontFamily: F_MONO, cursor: "pointer", ...style }}>
      {options.map(o => <option key={o.value} value={o.value} style={{ background: BLACK }}>{o.label}</option>)}
    </select>
  );
}
// Small labelled field wrapper for the stacked edit forms.
function EField({ label, children, span }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={{ fontSize: 12, fontFamily: F_MONO, letterSpacing: 1.5, color: STEEL_DIM }}>{label}</span>
      {children}
    </label>
  );
}
// Delete-row button — muted crimson outline, used at the corner of every edit card.
function DelBtn({ onClick }) {
  return (
    <button className="kg-tt-btn" onClick={onClick} title="Remove"
      style={{ background: mix(DUE, 8), border: `1px solid ${mix(DUE, 33)}`, borderRadius: 6, color: DUE,
        fontSize: 13, fontFamily: F_MONO, fontWeight: 700, padding: "4px 10px", flexShrink: 0, cursor: "pointer" }}>
      ✕ REMOVE
    </button>
  );
}
// Add-row button — chrome outline, ends every editable list.
function AddBtn({ onClick, label }) {
  return (
    <button className="kg-tt-btn" onClick={onClick}
      style={{ background: mix(CHROME, 6), border: `1px dashed ${mix(CHROME, 33)}`, borderRadius: 8, color: BONE_DIM,
        fontSize: 13, fontFamily: F_MONO, letterSpacing: 1.5, fontWeight: 700, padding: "9px 14px",
        cursor: "pointer", width: "100%", marginTop: 12 }}>
      + {label}
    </button>
  );
}

// ── Layout-2.0 primitives — section tag, ink kanji, state chip ────────────────
// Ink kanji — a machined glyph accent (the mockup's ink primitive, metal-tinted).
function InkK({ k, size = 20, style }) {
  return (
    <span aria-hidden="true" style={{ fontFamily: F_KANJI, fontWeight: 700, fontSize: size, lineHeight: 1,
      color: mix(CHROME, 45), filter: "blur(.3px)", userSelect: "none", ...style }}>{k}</span>
  );
}

// Section tag — kanji + letterspaced label + fading rule + optional right meta.
function SecTag({ k, label, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
      {k && <InkK k={k} />}
      <span style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: 3, color: STEEL,
        textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${LINE}, transparent)` }} />
      {right && <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 2, color: FAINT,
        textTransform: "uppercase", whiteSpace: "nowrap" }}>{right}</span>}
    </div>
  );
}

// State chip — blot dot + mono label; the mockup's .state, in Tetsu's muted tones.
function StateChip({ tone = "idle", children }) {
  const c = tone === "due" ? DUE : tone === "soon" ? SOON : tone === "ok" ? OK : STEEL_DIM;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: F_MONO,
      fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: c, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: c }} />
      {children}
    </span>
  );
}

// Consumed fraction of an interval (0..1) for the progress bar under each row.
function intervalFrac(item, odo) {
  const s = item.status;
  if (s.baseline) return 0.04;
  let fk = 0, fd = 0;
  if (item.intervalKm != null && item.intervalKm > 0) fk = (odo - (item.lastKm || 0)) / item.intervalKm;
  if (item.intervalMonths != null && s.daysLeft != null) {
    const totalDays = item.intervalMonths * 30.44;
    if (totalDays > 0) fd = (totalDays - s.daysLeft) / totalDays;
  }
  return Math.max(0.02, Math.min(1, Math.max(fk, fd)));
}

// ── Oil-life dial — half-arc gauge fed by the engine-oil schedule item ────────
function OilDial({ item, odo }) {
  const ARC = 213.6; // length of the 68px-radius half arc below
  const usedKm = Math.max(0, odo - (item.lastKm || 0));
  const life = item.status.baseline ? 1 : Math.max(0, Math.min(1, 1 - usedKm / item.intervalKm));
  const lvl = item.status.baseline ? "ok" : item.status.level;
  const c = lvl === "due" ? DUE : lvl === "soon" ? SOON : CHROME;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width="164" height="98" viewBox="0 0 164 98" role="img" aria-label={`Oil life ${Math.round(life * 100)} percent`}>
        <path d="M 14 90 A 68 68 0 0 1 150 90" fill="none" stroke={LINE} strokeWidth="8" strokeLinecap="round" />
        <path d="M 14 90 A 68 68 0 0 1 150 90" fill="none" stroke={c} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${Math.max(2, life * ARC)} ${ARC + 6}`} />
        <text x="82" y="70" textAnchor="middle" fontFamily="Consolas,monospace" fontSize="24" fontWeight="700"
          fill={c}>{Math.round(life * 100)}%</text>
        <text x="82" y="88" textAnchor="middle" fontFamily="Consolas,monospace" fontSize="8" letterSpacing="2"
          fill={FAINT}>OIL LIFE</text>
      </svg>
      <div style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 1.5, color: FAINT, textAlign: "center",
        textTransform: "uppercase" }}>
        {item.status.baseline
          ? `baseline · every ${fmtKm(item.intervalKm)} km`
          : `${fmtKm(usedKm)} / ${fmtKm(item.intervalKm)} km since change`}
      </div>
      <StateChip tone={lvl === "ok" ? "ok" : lvl}>
        {lvl === "due" ? "change due" : lvl === "soon" ? "change soon" : "within interval"}
      </StateChip>
    </div>
  );
}

// ── GARAGE — the layout-2.0 bench page: hero nameplate + odometer roller + oil
// dial, NEXT WRENCH callout, service intervals, log spine, torque + fluids bench.
// Absorbs the old MAINTENANCE view and the retired right-hand aside.
function GarageView({ bike, editing, updBike, odo, edit, items, raw, fluids, torque, torqueNote, onNote, entries, attention, oilItem }) {
  const unit = (bike && bike.unit) || "km";
  const dueN  = items.filter(s => s.status.level === "due").length;
  const soonN = items.filter(s => s.status.level === "soon").length;
  const okN   = items.filter(s => s.status.level === "ok").length;
  const lastWrench = entries.length ? entries[0].date : null;
  // Next wrench — most urgent non-baseline item with a real target (items pre-sorted DUE→SOON→OK).
  const top = items.find(s => !s.status.baseline && (s.status.nextKm != null || s.status.dueDate != null)) || null;
  const topOver = top && ((top.status.kmLeft != null && top.status.kmLeft <= 0) || (top.status.daysLeft != null && top.status.daysLeft <= 0));
  // Odometer roller digits — 6 wheels, last one hot.
  const digits = String(Math.max(0, Math.round(odo))).padStart(6, "0").slice(-6).split("");
  // Hero vitals — nearest km-based target + nearest date-based target.
  const vKm   = items.find(s => !s.status.baseline && s.status.nextKm != null) || null;
  const vDate = items.find(s => !s.status.baseline && s.status.dueDate != null) || null;

  // Schedule editor (EDIT mode) — the v1 inline forms, unchanged, hosted in the intervals card.
  const scheduleEditor = !edit.on ? null : (
    <>
      <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "0 0 14px" }}>
        Edit each item. <strong style={{ color: STEEL }}>Last km / last date</strong> drive the DUE/SOON/OK status: leave both blank for a not-done-yet baseline. Blank an interval for "on condition".
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {raw.map((item, i) => (
            <div key={item.id || `s-${i}`} style={{ background: GUN2, border: `1px solid ${LINE}`,
              borderRadius: 10, padding: "13px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <TInput value={item.task} onChange={v => edit.updRow("schedule", i, "task", v)} placeholder="Task (e.g. Engine oil + filter)" />
                </div>
                <DelBtn onClick={() => edit.delRow("schedule", i)} />
              </div>
              <div className="kg-tt-fieldgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 9 }}>
                <EField label="EVERY KM"><TNum value={item.intervalKm} onChange={v => edit.updRow("schedule", i, "intervalKm", v)} placeholder="8000" allowNull /></EField>
                <EField label="EVERY MO"><TNum value={item.intervalMonths} onChange={v => edit.updRow("schedule", i, "intervalMonths", v)} placeholder="12" allowNull /></EField>
                <EField label="LAST KM"><TNum value={item.lastKm} onChange={v => edit.updRow("schedule", i, "lastKm", v)} placeholder="0" /></EField>
                <EField label="LAST DATE"><TInput value={item.lastDate} onChange={v => edit.updRow("schedule", i, "lastDate", v)} placeholder="YYYY-MM-DD" mono /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <TInput value={item.note} onChange={v => edit.updRow("schedule", i, "note", v)} placeholder="Note (optional)" />
              </div>
            </div>
          ))}
          <AddBtn label="ADD SERVICE ITEM"
            onClick={() => edit.addRow("schedule", { id: `s${Date.now()}`, task: "", intervalKm: null, intervalMonths: null, lastKm: 0, lastDate: "", note: "" })} />
      </div>
    </>
  );

  return (
    <div style={{ animation: "ttFade .3s ease" }}>

      {/* ── page head — title block left, personal tag + state chips right ── */}
      <div className="kg-tt-garagehead" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: 3, color: STEEL, marginBottom: 10 }}>
            鉄 GARAGE <span style={{ color: FAINT }}>· THE WRENCH · PERSONAL</span>
          </div>
          <h2 style={{ fontFamily: F_COND, fontSize: 26, letterSpacing: 2, color: BONE, fontWeight: 700,
            margin: "0 0 8px", textTransform: "uppercase" }}>The bench, at rest.</h2>
          <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: 0, lineHeight: 1.7, maxWidth: "52ch" }}>
            One bike, one build-book. Service intervals scored live against the odometer, the logbook underneath, torque card within reach.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-end", paddingTop: 4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F_MONO, fontSize: 9.5,
            letterSpacing: 3, textTransform: "uppercase", padding: "4px 12px", borderRadius: 2,
            border: `1px solid ${mix(CHROME, 28)}`, color: STEEL }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%",
              background: "radial-gradient(circle at 42% 38%, var(--tt-rivet-hi), var(--tt-rivet-lo) 75%)" }} />
            PERSONAL · NUMBERLESS
          </span>
          <div style={{ display: "flex", gap: 15, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {dueN > 0 && <StateChip tone="due">{dueN} due</StateChip>}
            {soonN > 0 && <StateChip tone="soon">{soonN} soon</StateChip>}
            <StateChip tone="ok">{okN} ok</StateChip>
            {lastWrench && <StateChip tone="idle">last wrench {lastWrench}</StateChip>}
          </div>
        </div>
      </div>

      {/* ── BIKE HERO — brushed bench plate: nameplate + odometer roller + oil dial ── */}
      <div style={{ position: "relative", background: GUN2, backgroundImage: "var(--tt-grain)",
        border: `1px solid ${LINE}`, borderTop: `2px solid ${CHROME}`, borderRadius: 12,
        overflow: "hidden", marginBottom: 16 }}>
        <Rivet style={{ top: 7, left: 9 }} />
        <Rivet style={{ top: 7, right: 9 }} />
        <Rivet style={{ bottom: 7, left: 9 }} />
        <Rivet style={{ bottom: 7, right: 9 }} />
        <div className="kg-tt-herogrid" style={{ display: "grid", gridTemplateColumns: "1.25fr .95fr .85fr" }}>

          {/* bay 1 — identity + specs (edit form when EDIT is on) */}
          <div style={{ position: "relative", padding: "22px 26px", borderRight: `1px solid ${LINE}`, minWidth: 0 }}>
            {editing ? (
              <BikeEditForm bike={bike} updBike={updBike} />
            ) : bike ? (
              <>
                <InkK k="鉄" size={92} style={{ position: "absolute", right: 14, top: 8, opacity: .16 }} />
                {bike.photo && (
                  <img src={bike.photo} alt={`${bike.make} ${bike.model}`} loading="lazy"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                    style={{ display: "block", width: "100%", height: 120, objectFit: "cover",
                      borderRadius: 8, border: `1px solid ${LINE}`, background: BLACK, marginBottom: 14 }} />
                )}
                <div style={{ position: "relative" }}>
                  <div style={{ fontFamily: F_COND, fontSize: 30, fontWeight: 700, lineHeight: 1.1,
                    letterSpacing: 3, textTransform: "uppercase", ...chromeText }}>{bike.model}</div>
                  <div style={{ fontSize: 11, fontFamily: F_MONO, color: STEEL_DIM, marginTop: 6,
                    letterSpacing: 1.5, textTransform: "uppercase" }}>
                    {bike.make} · {bike.code} · {bike.year}
                  </div>
                  <div style={{ marginTop: 15, display: "flex", flexDirection: "column", gap: 7 }}>
                    <SpecRow label="ENGINE" value={bike.engine} />
                    <SpecRow label="DRIVE"  value={bike.drive} />
                    <SpecRow label="FUEL"   value={bike.fuel} />
                    <SpecRow label="TYRE F" value={bike.tirePressureFront} />
                    <SpecRow label="TYRE R" value={bike.tirePressureRear} />
                  </div>
                  {bike.notes && (
                    <div style={{ fontSize: 13, color: STEEL_DIM, marginTop: 12, lineHeight: 1.6,
                      borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>{bike.notes}</div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: STEEL_DIM, fontSize: 13.5, fontFamily: F_MONO }}>No bike loaded. Press EDIT to add one.</div>
            )}
          </div>

          {/* bay 2 — odometer roller + stepper + vitals */}
          <div style={{ padding: "22px 24px", borderRight: `1px solid ${LINE}`, minWidth: 0 }}>
            <SecTag label="ODOMETER" />
            <div style={{ display: "flex", gap: 4 }}>
              {digits.map((d, i) => {
                const hot = i === digits.length - 1;
                return (
                  <span key={i} style={{ width: 30, height: 42, display: "flex", alignItems: "center",
                    justifyContent: "center", fontFamily: F_MONO, fontWeight: 700, fontSize: 22,
                    color: hot ? CHROME : BONE_DIM,
                    background: `linear-gradient(180deg, ${BLACK}, ${GUN} 46%, ${BLACK})`,
                    border: `1px solid ${hot ? mix(CHROME, 30) : LINE}`, borderRadius: 2,
                    boxShadow: "var(--tt-odo-inset)" }}>{d}</span>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <div className="kg-tt-odostep" style={{ display: "flex", alignItems: "center", border: `1px solid ${LINE_STR}`,
                borderRadius: 8, overflow: "hidden" }}>
                <button className="kg-tt-btn" onClick={() => updBike("odometer", Math.max(0, odo - ODO_STEP))}
                  style={{ background: GUN3, border: "none", color: BONE, width: 32, height: 30,
                    fontSize: 18, lineHeight: 1, cursor: "pointer" }}>−</button>
                <button className="kg-tt-btn" onClick={() => updBike("odometer", odo + ODO_STEP)}
                  style={{ background: GUN3, borderLeft: `1px solid ${LINE_STR}`, borderRight: "none",
                    borderTop: "none", borderBottom: "none", color: BONE, width: 32, height: 30,
                    fontSize: 18, lineHeight: 1, cursor: "pointer" }}>＋</button>
              </div>
              {editing ? (
                <TNum value={odo} onChange={v => updBike("odometer", Math.max(0, v || 0))}
                  style={{ width: 100, fontSize: 16, fontWeight: 700, textAlign: "right", color: BONE }} />
              ) : (
                <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: 2, color: FAINT,
                  textTransform: "uppercase" }}>{unit} · STEP ±{fmtKm(ODO_STEP)}</span>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              {vKm && (
                <div style={{ padding: "9px 0 5px" }}>
                  <div style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: 2.5, color: FAINT,
                    textTransform: "uppercase" }}>NEXT SERVICE</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 13.5, color: BONE_DIM, marginTop: 3 }}>
                    <span style={{ color: CHROME, fontWeight: 700 }}>{fmtKm(vKm.status.nextKm)}</span> {unit}
                    {vKm.status.kmLeft != null && (vKm.status.kmLeft > 0
                      ? ` · in ${fmtKm(vKm.status.kmLeft)} ${unit}`
                      : ` · ${fmtKm(-vKm.status.kmLeft)} ${unit} over`)}
                  </div>
                </div>
              )}
              {vDate && (
                <div style={{ padding: "9px 0 5px", borderTop: vKm ? `1px solid ${LINE}` : "none" }}>
                  <div style={{ fontFamily: F_MONO, fontSize: 9.5, letterSpacing: 2.5, color: FAINT,
                    textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vDate.task}</div>
                  <div style={{ fontFamily: F_MONO, fontSize: 13.5, color: BONE_DIM, marginTop: 3 }}>
                    due {fmtDate(vDate.status.dueDate)}
                    {vDate.status.daysLeft != null && (vDate.status.daysLeft > 0
                      ? <> · <span style={{ color: CHROME, fontWeight: 700 }}>{vDate.status.daysLeft} days</span> left</>
                      : <> · <span style={{ color: DUE, fontWeight: 700 }}>{-vDate.status.daysLeft} days</span> over</>)}
                  </div>
                </div>
              )}
              {!vKm && !vDate && (
                <div style={{ fontSize: 12.5, color: FAINT, fontFamily: F_MONO, marginTop: 8, lineHeight: 1.6 }}>
                  No live targets yet. Log a service or set intervals.
                </div>
              )}
            </div>
          </div>

          {/* bay 3 — oil-life dial */}
          <div style={{ padding: "22px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6, minWidth: 0 }}>
            {oilItem ? (
              <OilDial item={oilItem} odo={odo} />
            ) : (
              <div style={{ fontSize: 12.5, color: FAINT, fontFamily: F_MONO, textAlign: "center", lineHeight: 1.7 }}>
                No oil interval tracked.<br />Add an engine-oil item to the schedule.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── NEXT WRENCH — bench callout, one quiet stroke ── */}
      {top && !edit.on && (
        <div className="kg-tt-card" style={{ display: "flex", alignItems: "center", gap: 20,
          background: GUN2, border: `1px solid ${LINE}`, borderLeft: `2px solid ${topOver ? DUE : CHROME}`,
          borderRadius: 12, padding: "15px 22px", marginBottom: 28 }}>
          <InkK k="締" size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F_UI, fontSize: 15.5, fontWeight: 600, color: BONE, lineHeight: 1.35 }}>
              Next wrench - {top.task}
            </div>
            <div style={{ fontFamily: F_MONO, fontSize: 11.5, color: STEEL_DIM, marginTop: 4, lineHeight: 1.6 }}>
              {[
                top.status.nextKm != null ? `due at ${fmtKm(top.status.nextKm)} ${unit}` : null,
                top.status.dueDate ? `${top.status.nextKm != null ? "or " : "due "}${fmtDate(top.status.dueDate)}` : null,
                top.note || null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ fontFamily: F_MONO, fontSize: 21, fontWeight: 700, whiteSpace: "nowrap",
            color: topOver ? DUE : CHROME }}>
            {top.status.kmLeft != null
              ? (top.status.kmLeft > 0 ? fmtKm(top.status.kmLeft) : fmtKm(-top.status.kmLeft))
              : Math.abs(top.status.daysLeft)}
            {" "}<small style={{ fontSize: 10, color: STEEL_DIM, fontWeight: 400, letterSpacing: 1.5 }}>
              {top.status.kmLeft != null
                ? (top.status.kmLeft > 0 ? `${unit} LEFT` : `${unit} OVER`)
                : (top.status.daysLeft > 0 ? "DAYS LEFT" : "DAYS OVER")}
            </small>
          </div>
        </div>
      )}

      {/* ── INTERVALS + LOG ── */}
      <div className="kg-tt-colgrid" style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 16, marginBottom: 28, alignItems: "start" }}>

        {/* service intervals */}
        <div style={{ background: GUN, border: `1px solid ${LINE}`, borderRadius: 12, padding: "18px 20px" }}>
          <SecTag k="間" label="SERVICE INTERVALS" right={`VS ODO ${fmtKm(odo)}`} />
          {edit.on ? scheduleEditor : (
            <>
              <div style={{ fontSize: 12, fontFamily: F_MONO, color: attention ? SOON : OK, marginBottom: 6 }}>
                {attention ? `${attention} item${attention > 1 ? "s" : ""} need${attention > 1 ? "" : "s"} attention` : "all within interval"}
              </div>
              {items.length === 0 && (
                <div style={{ color: STEEL_DIM, fontSize: 14, padding: "22px 0" }}>No service items. Press EDIT to add your own.</div>
              )}
              {items.map(item => <IntervalRow key={item.id} item={item} odo={odo} unit={unit} />)}
            </>
          )}
        </div>

        {/* service log — brush-spine, newest first (entries are edited in LOGBOOK) */}
        <div style={{ position: "relative", background: GUN, border: `1px solid ${LINE}`, borderRadius: 12,
          padding: "18px 20px", overflow: "hidden" }}>
          <InkK k="録" size={84} style={{ position: "absolute", right: 14, top: 6, opacity: .14 }} />
          <SecTag k="録" label="SERVICE LOG" right={`${entries.length} ENTRIES`} />
          {entries.length === 0 && !top && (
            <div style={{ color: STEEL_DIM, fontSize: 14, padding: "22px 0" }}>Nothing logged yet. Add entries in LOGBOOK.</div>
          )}
          {(entries.length > 0 || top) && (
          <div style={{ position: "relative" }}>
            {/* the spine — a brush stroke cooling from chrome (now) into ink (the past) */}
            <span aria-hidden="true" style={{ position: "absolute", left: 5, top: 4, bottom: 6, width: 3,
              borderRadius: 2, filter: "blur(.5px)",
              background: `linear-gradient(to bottom, ${mix(CHROME, 55)}, ${mix(STEEL_DIM, 60)} 22%, ${mix(STEEL_DIM, 75)})` }} />
            {top && (
              <div style={{ position: "relative", paddingLeft: 30, paddingBottom: 22 }}>
                <span aria-hidden="true" style={{ position: "absolute", left: 1, top: 4, width: 11, height: 11,
                  borderRadius: "50%", background: `radial-gradient(circle at 42% 38%, ${CHROME}, ${STEEL_DIM} 75%)`,
                  boxShadow: `0 0 10px ${mix(CHROME, 30)}` }} />
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 1.5, color: FAINT }}>
                  <b style={{ color: STEEL, fontWeight: 600 }}>NEXT</b>
                  {top.status.nextKm != null ? ` · due ${fmtKm(top.status.nextKm)} ${unit}` : top.status.dueDate ? ` · due ${fmtDate(top.status.dueDate)}` : ""}
                </div>
                <div style={{ fontSize: 13, color: BONE_DIM, lineHeight: 1.6, marginTop: 2 }}>
                  {top.task}
                  {top.status.kmLeft != null && top.status.kmLeft > 0 ? ` - ${fmtKm(top.status.kmLeft)} ${unit} out` : ""}
                </div>
              </div>
            )}
            {entries.map((e, i) => (
              <div key={`${e.date}-${i}`} style={{ position: "relative", paddingLeft: 30,
                paddingBottom: i < entries.length - 1 ? 22 : 4 }}>
                <span aria-hidden="true" style={{ position: "absolute", left: 1, top: 4, width: 11, height: 11,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 42% 38%, var(--tt-rivet-hi), var(--tt-rivet-lo) 75%)" }} />
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, letterSpacing: 1.5, color: FAINT }}>
                  <b style={{ color: STEEL, fontWeight: 600 }}>{e.date || "undated"}</b> · {fmtKm(e.odo)} {unit}
                </div>
                <div style={{ fontSize: 13, color: BONE_DIM, lineHeight: 1.6, marginTop: 2 }}>
                  {e.title}
                  {(e.tags || []).length > 0 && (
                    <span style={{ fontFamily: F_MONO, fontSize: 10.5, color: STEEL_DIM }}> · {e.tags.join(", ")}</span>
                  )}
                </div>
                {e.note && (
                  <div style={{ fontSize: 12, color: STEEL_DIM, lineHeight: 1.55, marginTop: 3 }}>{e.note}</div>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ── BENCH REFERENCE — torque card + fluids & capacities ── */}
      <div className="kg-tt-colgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* torque bench card */}
        <div style={{ background: GUN, border: `1px solid ${LINE}`, borderRadius: 12, padding: "18px 20px" }}>
          <SecTag k="締" label="TORQUE · BENCH CARD" right={torque.length ? `${torque.length} SPECS` : ""} />
          {edit.on ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {torque.map((t, i) => (
                <div key={`tq-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TInput value={t.item} onChange={v => edit.updRow("torque", i, "item", v)} placeholder="Fastener" />
                  <TInput value={t.value} onChange={v => edit.updRow("torque", i, "value", v)} placeholder="19–28 Nm" mono />
                  <DelBtn onClick={() => edit.delRow("torque", i)} />
                </div>
              ))}
              <AddBtn label="ADD TORQUE SPEC" onClick={() => edit.addRow("torque", { item: "", value: "" })} />
              <div style={{ marginTop: 10 }}>
                <EField label="TORQUE NOTE / DISCLAIMER">
                  <TArea value={torqueNote} onChange={onNote} placeholder="Guideline values: always verify against the manual." />
                </EField>
              </div>
            </div>
          ) : (
            <>
              {torque.length === 0 && (
                <div style={{ color: STEEL_DIM, fontSize: 14, padding: "22px 0" }}>No torque specs yet. Press EDIT to add them.</div>
              )}
              {torque.map((t, i) => (
                <div key={`${t.item}-${i}`} className="kg-tt-refrow" style={{ display: "flex", alignItems: "baseline", gap: 10,
                  padding: "8px 2px", borderBottom: i < torque.length - 1 ? `1px solid ${LINE}` : "none" }}>
                  <span style={{ fontSize: 13, color: BONE_DIM, flexShrink: 0 }}>{t.item}</span>
                  <span aria-hidden="true" style={{ flex: 1, borderBottom: `1px dotted ${LINE_STR}`,
                    transform: "translateY(-3px)" }} />
                  <span style={{ fontFamily: F_MONO, fontSize: 12.5, color: CHROME, fontWeight: 600,
                    whiteSpace: "nowrap" }}>{t.value}</span>
                </div>
              ))}
              {torqueNote && (
                <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: FAINT, marginTop: 14, lineHeight: 1.7 }}>
                  {torqueNote}
                </div>
              )}
            </>
          )}
        </div>

        {/* fluids & capacities */}
        <div style={{ background: GUN, border: `1px solid ${LINE}`, borderRadius: 12, padding: "18px 20px" }}>
          <SecTag k="油" label="FLUIDS & CAPACITIES" right={(bike && bike.code) || ""} />
          {edit.on ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fluids.map((f, i) => (
                <div key={`f-${i}`} style={{ background: GUN2, border: `1px solid ${LINE}`, borderRadius: 8,
                  padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <TInput value={f.name} onChange={v => edit.updRow("fluids", i, "name", v)} placeholder="Fluid (e.g. Engine oil)" />
                  <div style={{ display: "flex", gap: 6 }}>
                    <TInput value={f.spec} onChange={v => edit.updRow("fluids", i, "spec", v)} placeholder="Spec" mono />
                    <TInput value={f.capacity} onChange={v => edit.updRow("fluids", i, "capacity", v)} placeholder="Qty" mono style={{ maxWidth: 96 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <DelBtn onClick={() => edit.delRow("fluids", i)} />
                  </div>
                </div>
              ))}
              <AddBtn label="ADD FLUID" onClick={() => edit.addRow("fluids", { name: "", spec: "", capacity: "" })} />
            </div>
          ) : (
            <>
              {fluids.length === 0 && (
                <div style={{ color: STEEL_DIM, fontSize: 14, padding: "22px 0" }}>No fluids listed yet. Press EDIT to add them.</div>
              )}
              {fluids.map((f, i) => (
                <div key={`${f.name}-${i}`} className="kg-tt-refrow kg-tt-fluidrow" style={{ display: "flex", alignItems: "baseline", gap: 10,
                  padding: "9px 2px", borderBottom: i < fluids.length - 1 ? `1px solid ${LINE}` : "none" }}>
                  <span style={{ fontSize: 13, color: BONE_DIM, width: 150, flexShrink: 0 }}>{f.name}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 11.5, color: STEEL_DIM, flex: 1, minWidth: 0 }}>{f.spec}</span>
                  <span style={{ fontFamily: F_MONO, fontSize: 11.5, whiteSpace: "nowrap",
                    color: mix(CHROME, 75) }}>{f.capacity}</span>
                </div>
              ))}
              <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: FAINT, marginTop: 14, lineHeight: 1.7 }}>
                Odometer changes rescore every interval live; edits auto-save to the personal corpus.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Interval row — hairline rule + thin consumed-fraction bar (mockup .tt-int) ─
function IntervalRow({ item, odo, unit }) {

  const s = item.status;
  const frac = intervalFrac(item, odo);
  const tone = s.baseline ? "idle" : s.level;
  const attentive = s.level === "due" || s.level === "soon";
  return (
    <div style={{ padding: "12px 2px", borderBottom: `1px solid ${LINE}` }}>
      <div className="kg-tt-introw" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: BONE_DIM, fontWeight: 500, lineHeight: 1.4 }}>{item.task}</div>
          <div style={{ fontFamily: F_MONO, fontSize: 10.5, color: FAINT, marginTop: 2 }}>
            {intervalText(item)}
            {!s.baseline && ` · last ${fmtKm(item.lastKm)} ${unit}${item.lastDate ? ` ${item.lastDate}` : ""}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 13, flexShrink: 0, paddingTop: 2 }}>
          <span style={{ fontFamily: F_MONO, fontSize: 11, color: STEEL_DIM, whiteSpace: "nowrap" }}>
            {s.baseline ? "baseline - not done yet"
              : s.nextKm != null
                ? <>next <b style={{ color: BONE_DIM, fontWeight: 600 }}>{fmtKm(s.nextKm)}</b>{s.kmLeft != null ? (s.kmLeft > 0 ? ` · ${fmtKm(s.kmLeft)} left` : ` · ${fmtKm(-s.kmLeft)} over`) : ""}</>
                : s.dueDate
                  ? <>due <b style={{ color: BONE_DIM, fontWeight: 600 }}>{fmtDate(s.dueDate)}</b>{s.daysLeft != null ? (s.daysLeft > 0 ? ` · ${s.daysLeft} days` : ` · ${-s.daysLeft} days over`) : ""}</>
                  : "on condition"}
          </span>
          <StateChip tone={tone}>{s.baseline ? "baseline" : s.level}</StateChip>
        </div>
      </div>
      {item.note && (
        <div style={{ fontSize: 12, color: STEEL_DIM, marginTop: 6, lineHeight: 1.55 }}>{item.note}</div>
      )}
      {/* consumed fraction of the interval — thin machined bar, no glow */}
      <div style={{ height: 3, background: GUN3, borderRadius: 2, overflow: "hidden", marginTop: 9 }}>
        <span style={{ display: "block", height: "100%", width: `${Math.round(frac * 100)}%`, borderRadius: 2,
          background: attentive
            ? `linear-gradient(90deg, ${mix(s.level === "due" ? DUE : SOON, 45)}, ${s.level === "due" ? DUE : SOON})`
            : `linear-gradient(90deg, ${mix(STEEL_DIM, 40)}, ${STEEL_DIM})` }} />
      </div>
    </div>
  );
}

// ── LOGBOOK — maintenance history newest-first with photo/screenshot slots ────
function LogbookView({ entries, raw, edit }) {
  if (edit.on) {
    return (
      <div style={{ animation: "ttFade .3s ease" }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>LOGBOOK</h2>
        <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "6px 0 18px" }}>
          Log work as you do it. Tags are comma-separated (e.g. oil, belt). The read view sorts newest-first.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {raw.map((e, i) => (
            <div key={`l-${i}`} style={{ background: GUN2, border: `1px solid ${LINE}`, borderRadius: 10,
              padding: "13px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <TInput value={e.title} onChange={v => edit.updRow("log", i, "title", v)} placeholder="What was done" />
                </div>
                <DelBtn onClick={() => edit.delRow("log", i)} />
              </div>
              <div className="kg-tt-fieldgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 9 }}>
                <EField label="DATE"><TInput value={e.date} onChange={v => edit.updRow("log", i, "date", v)} placeholder="YYYY-MM-DD" mono /></EField>
                <EField label="ODO KM"><TNum value={e.odo} onChange={v => edit.updRow("log", i, "odo", v)} placeholder="0" /></EField>
                <EField label="PHOTO"><TInput value={e.photo} onChange={v => edit.updRow("log", i, "photo", v)} placeholder="file name" mono /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <EField label="TAGS">
                  <TInput mono value={(e.tags || []).join(", ")}
                    onChange={v => edit.updRow("log", i, "tags", v.split(",").map(t => t.trim()).filter(Boolean))}
                    placeholder="oil, belt, brakes" />
                </EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <TArea value={e.note} onChange={v => edit.updRow("log", i, "note", v)} placeholder="Detail (optional)" />
              </div>
            </div>
          ))}
          <AddBtn label="ADD LOGBOOK ENTRY"
            onClick={() => edit.addRow("log", { date: "", odo: 0, title: "", tags: [], note: "", photo: "" })} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ animation: "ttFade .3s ease" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>LOGBOOK</h2>
        <span style={{ fontSize: 13, fontFamily: F_MONO, color: STEEL_DIM }}>{entries.length} entries</span>
      </div>
      <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "0 0 18px" }}>
        Work done, newest first: each entry has a photo slot.
      </p>

      {entries.length === 0 && (
        <div style={{ color: STEEL_DIM, fontSize: 14, padding: "30px 0" }}>No entries logged yet. Press EDIT to add one.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {entries.map((e, i) => (
          <div key={`${e.date}-${i}`} className="kg-tt-card"
            style={{ display: "flex", gap: 16, background: GUN2, border: `1px solid ${LINE}`,
              borderRadius: 11, padding: "15px 16px", animation: "ttPop .22s ease" }}>
            {/* photo / screenshot tile */}
            <div style={{ flexShrink: 0, width: 110, height: 110, borderRadius: 10,
              border: `1px dashed ${e.photo ? mix(CHROME, 35) : LINE_STR}`,
              background: e.photo
                ? `radial-gradient(120% 120% at 30% 15%, ${GUN3}, ${BLACK})`
                : BLACK,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
              overflow: "hidden", padding: "0 8px" }}>
              <span style={{ fontSize: 30, opacity: e.photo ? 0.9 : 0.4,
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,.5))" }}>{e.photo ? "📷" : "🔧"}</span>
              {e.photo ? (
                <span style={{ fontSize: 12, fontFamily: F_MONO, color: CHROME, textAlign: "center",
                  lineHeight: 1.3, wordBreak: "break-all" }}>{e.photo}</span>
              ) : (
                <span style={{ fontSize: 12, fontFamily: F_MONO, color: FAINT }}>no photo</span>
              )}
            </div>

            {/* entry body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontFamily: F_MONO, color: CHROME, fontWeight: 600 }}>{e.date}</span>
                <span style={{ fontSize: 13, fontFamily: F_MONO, color: STEEL }}>{fmtKm(e.odo)} km</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: BONE, marginTop: 5, lineHeight: 1.3 }}>{e.title}</div>
              {(e.tags || []).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  {e.tags.map(t => (
                    <span key={t} style={{ fontSize: 12.5, fontFamily: F_MONO, color: STEEL,
                      background: mix(CHROME, 7), border: `1px solid ${mix(CHROME, 20)}`, borderRadius: 4, padding: "1px 7px" }}>{t}</span>
                  ))}
                </div>
              )}
              {e.note && (
                <div style={{ fontSize: 13.5, color: STEEL_DIM, marginTop: 10, lineHeight: 1.6 }}>{e.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: FAINT, marginTop: 16, lineHeight: 1.6 }}>
        Photo slots are placeholders for now: real image upload comes in a later phase.
      </div>
    </div>
  );
}

// ── MANUALS — manual shelf + full-text reader (torque moved to the GARAGE bench) ─
function ManualsView({ manuals, edit }) {
  if (edit.on) {
    return (
      <div style={{ animation: "ttFade .3s ease" }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>MANUALS</h2>
        <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "6px 0 18px" }}>
          Your reference shelf. Torque specs are edited on the GARAGE bench card.
        </p>

        {/* manuals */}
        <div style={{ fontSize: 13, letterSpacing: 2, color: STEEL, fontFamily: F_MONO, marginBottom: 10 }}>SOURCES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {manuals.map((mn, i) => (
            <div key={`mn-${i}`} style={{ background: GUN2, border: `1px solid ${LINE}`, borderRadius: 10, padding: "13px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <TInput value={mn.title} onChange={v => edit.updRow("manuals", i, "title", v)} placeholder="Title" />
                </div>
                <DelBtn onClick={() => edit.delRow("manuals", i)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
                <EField label="TYPE">
                  <TSelect value={mn.type} onChange={v => edit.updRow("manuals", i, "type", v)}
                    options={[{ value: "PDF", label: "PDF" }, { value: "CARD", label: "CARD" }, { value: "LINK", label: "LINK" }]} />
                </EField>
                <EField label="REF"><TInput value={mn.ref} onChange={v => edit.updRow("manuals", i, "ref", v)} placeholder="99484-13" mono /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <TInput value={mn.note} onChange={v => edit.updRow("manuals", i, "note", v)} placeholder="Note (optional)" />
              </div>
            </div>
          ))}
          <AddBtn label="ADD MANUAL" onClick={() => edit.addRow("manuals", { title: "", type: "PDF", ref: "", note: "" })} />
        </div>

      </div>
    );
  }
  return (
    <div style={{ animation: "ttFade .3s ease" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>MANUALS</h2>
        <span style={{ fontSize: 13, fontFamily: F_MONO, color: STEEL_DIM }}>{manuals.length} sources</span>
      </div>
      <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "0 0 18px" }}>
        Workshop references. The torque bench card lives on the GARAGE page.
      </p>

      {/* manual shelf */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {manuals.map((mn, i) => (
          <div key={`${mn.title}-${i}`} className="kg-tt-card"
            style={{ display: "flex", gap: 14, background: GUN2, border: `1px solid ${LINE}`,
              borderRadius: 11, padding: "14px 15px" }}>
            {/* manual-page thumbnail placeholder */}
            <div style={{ flexShrink: 0, width: 62, height: 82, borderRadius: 6,
              background: `linear-gradient(155deg, ${GUN3}, ${BLACK})`,
              border: `1px solid ${LINE_STR}`, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 2px 0 0 rgba(0,0,0,.35)" }}>
              <span style={{ fontSize: 26, opacity: 0.85 }}>📖</span>
            </div>
            {/* manual meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontFamily: F_MONO, fontWeight: 700, letterSpacing: 1,
                  color: mn.type === "PDF" ? CHROME : STEEL,
                  background: mix(mn.type === "PDF" ? CHROME : STEEL, 8),
                  border: `1px solid ${mix(mn.type === "PDF" ? CHROME : STEEL, 27)}`,
                  borderRadius: 4, padding: "1px 7px" }}>{mn.type}</span>
                {mn.ref && (
                  <span style={{ fontSize: 12.5, fontFamily: F_MONO, color: STEEL_DIM,
                    border: `1px solid ${LINE}`, borderRadius: 4, padding: "1px 7px" }}>{mn.ref}</span>
                )}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: BONE, marginTop: 8, lineHeight: 1.3 }}>{mn.title}</div>
              {mn.note && (
                <div style={{ fontSize: 13, color: STEEL_DIM, marginTop: 7, lineHeight: 1.55 }}>{mn.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* full-text manual reader — additive, sits below the shelf */}
      <ManualReader />
    </div>
  );
}

// ── Manual READER — open + full-text-search the real workshop-manual chapters ──
// State is local to this reader (it only mounts inside MANUALS). The chapter LIST loads
// once on mount; a chapter's TEXT loads lazily when selected. The rendered line-rows are
// memoized on [lines, target] so typing in the search box never re-renders the (up to
// ~15k-line) chapter pane. Every fetch degrades quietly — no crash, no broken UI.
function ManualReader({ paper }) {
  // Tone set — the reader renders on either ground: the dark bench (default)
  // or the fresh-paper MANUAL page (paper). Same logic, two print registers.
  const T = paper ? {
    label: FP.ink, sub: FP.mid, faint: FP.stone, err: FP.due,
    railBg: PP_PAGE_BG, railBgOn: FP.ink, railBd: FP.rule, railBdOn: FP.ink,
    railTx: FP.ink, railTxOn: FP.paper,
    paneBg: PP_PAGE_BG, paneBd: FP.ink, headBg: FP.conc, headTx: FP.ink,
    ln: FP.stone, lnHot: FP.due, text: FP.body, hotBg: FP.redSmall, hotEdge: FP.due,
    hitBg: PP_PAGE_BG, hitBd: FP.rule, chipTx: FP.mid, chipBd: FP.rule, hitTx: FP.body,
    input: { ...ppInput, fontFamily: F_UI },
    btn: { background: FP.ink, border: "none", borderRadius: 0, color: FP.paper },
    radius: 0,
  } : {
    label: STEEL, sub: STEEL_DIM, faint: FAINT, err: DUE,
    railBg: GUN2, railBgOn: mix(CHROME, 8), railBd: LINE, railBdOn: mix(CHROME, 40),
    railTx: BONE_DIM, railTxOn: BONE,
    paneBg: BLACK, paneBd: LINE, headBg: GUN, headTx: BONE,
    ln: FAINT, lnHot: CHROME, text: BONE_DIM, hotBg: mix(CHROME, 11), hotEdge: CHROME,
    hitBg: GUN2, hitBd: LINE, chipTx: STEEL, chipBd: LINE_STR, hitTx: BONE_DIM,
    input: { ...inputBase, fontFamily: F_UI },
    btn: { background: mix(CHROME, 7), border: `1px solid ${mix(CHROME, 33)}`, borderRadius: 6, color: BONE_DIM },
    radius: 8,
  };
  const [chapters, setChapters]       = useState([]);      // [{id,label,file,lines}]
  const [chapErr, setChapErr]         = useState(false);   // chapter-list fetch failed
  const [selId, setSelId]             = useState("");       // selected chapter id
  const [selLabel, setSelLabel]       = useState("");
  const [text, setText]               = useState("");
  const [loadingChap, setLoadingChap] = useState(false);
  const [chapReadErr, setChapReadErr] = useState(false);
  const [q, setQ]                     = useState("");
  const [hits, setHits]               = useState([]);
  const [searched, setSearched]       = useState(false);
  const [searching, setSearching]     = useState(false);
  const [target, setTarget]           = useState(null);    // 1-based line to highlight/scroll
  const paneRef = useRef(null);

  // chapter list — once, on mount
  useEffect(() => {
    let live = true;
    API_GET("/api/manual/chapters")
      .then(d => { if (live) setChapters(Array.isArray(d?.chapters) ? d.chapters : []); })
      .catch(() => { if (live) setChapErr(true); });
    return () => { live = false; };
  }, []);

  // load a chapter's text (lazy). optional `line` = highlight + scroll target.
  function openChapter(id, line = null) {
    setSelId(id); setLoadingChap(true); setChapReadErr(false); setText(""); setTarget(null);
    const meta = chapters.find(c => c.id === id);
    setSelLabel(meta ? meta.label : id);
    API_GET("/api/manual/chapter?id=" + encodeURIComponent(id))
      .then(d => {
        setText(typeof d?.text === "string" ? d.text : "");
        if (d?.error) setChapReadErr(true);
        setLoadingChap(false);
        if (line) setTarget(line);
      })
      .catch(() => { setLoadingChap(false); setChapReadErr(true); });
  }

  // full-text search across all chapters
  function runSearch(e) {
    if (e) e.preventDefault();
    const term = q.trim();
    if (!term) { setHits([]); setSearched(false); return; }
    setSearching(true);
    API_GET("/api/manual/search?q=" + encodeURIComponent(term))
      .then(d => { setHits(Array.isArray(d?.hits) ? d.hits : []); setSearched(true); setSearching(false); })
      .catch(() => { setHits([]); setSearched(true); setSearching(false); });
  }

  const lines = useMemo(() => (text ? text.split(/\r?\n/) : []), [text]);
  // memoized on [lines, target]: search-box keystrokes (which only change `q`) reuse
  // these element instances, so React skips re-rendering the huge line list.
  const rows = useMemo(() => lines.map((ln, i) => {
    const n = i + 1;
    const hot = n === target;
    return (
      <div key={n} data-ln={n} style={{ display: "flex", gap: 10, padding: "0 6px",
        background: hot ? T.hotBg : "transparent",
        borderLeft: hot ? `2px solid ${T.hotEdge}` : "2px solid transparent" }}>
        <span style={{ flexShrink: 0, width: 48, textAlign: "right", userSelect: "none",
          color: hot ? T.lnHot : T.ln, fontFamily: F_MONO, fontSize: 13, lineHeight: "1.55em" }}>{n}</span>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
          color: T.text, fontFamily: F_MONO, fontSize: 13.5, lineHeight: "1.55em" }}>{ln || " "}</span>
      </div>
    );
  }), [lines, target]);

  // after a chapter renders with a target line, scroll it into view + centre it
  useEffect(() => {
    if (!target || !paneRef.current) return;
    const el = paneRef.current.querySelector(`[data-ln="${target}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }, [target, rows]);

  return (
    <div style={{ marginTop: paper ? 0 : 34 }}>
      <div style={{ fontSize: paper ? 11 : 13, letterSpacing: 2, color: T.label, fontFamily: F_MONO,
        fontWeight: paper ? 700 : 400, marginBottom: 4 }}>THE READER</div>
      <p style={{ fontSize: 13.5, color: paper ? FP.body : T.sub, fontFamily: paper ? F_UI : undefined,
        margin: "0 0 14px" }}>
        Open and search the full 2013 Sportster workshop manual.
      </p>

      {/* search box */}
      <form onSubmit={runSearch} style={{ display: "flex", gap: 8, maxWidth: 560, marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the manual…  (e.g. spark plug gap)"
          style={{ ...T.input, flex: 1 }} />
        <button type="submit" className="kg-tt-btn"
          style={{ ...T.btn, fontSize: 13, fontFamily: F_MONO, letterSpacing: 1.5, fontWeight: 700,
            padding: "0 16px", cursor: "pointer", flexShrink: 0 }}>
          SEARCH
        </button>
      </form>

      {/* search results */}
      {searching && (
        <div style={{ fontSize: 13.5, color: T.sub, fontFamily: F_MONO, marginBottom: 14 }}>Searching…</div>
      )}
      {!searching && searched && (
        <div style={{ maxWidth: 560, marginBottom: 18 }}>
          {hits.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.sub, fontFamily: F_MONO }}>No matches for “{q.trim()}”.</div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: T.faint, fontFamily: F_MONO, marginBottom: 8 }}>
                {hits.length} match{hits.length === 1 ? "" : "es"}{hits.length >= 60 ? " (capped)" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hits.map((h, i) => (
                  <button key={`${h.chapterId}-${h.line}-${i}`} className="kg-tt-btn"
                    onClick={() => openChapter(h.chapterId, h.line)}
                    style={{ textAlign: "left", background: T.hitBg, border: `1px solid ${T.hitBd}`,
                      borderRadius: T.radius, padding: "9px 11px", cursor: "pointer", display: "flex",
                      gap: 10, alignItems: "baseline" }}>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontFamily: F_MONO, color: T.chipTx,
                      border: `1px solid ${T.chipBd}`, borderRadius: T.radius ? 4 : 0, padding: "1px 6px" }}>
                      {h.chapterLabel} · {h.line}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.hitTx, fontFamily: F_MONO,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.snippet}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* chapter rail + reading pane */}
      <div className="kg-tt-reader" style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        {/* rail */}
        <div className="kg-tt-reader-rail" style={{ flexShrink: 0, width: 190, display: "flex", flexDirection: "column", gap: paper ? 0 : 6,
          border: paper ? `1px solid ${FP.rule}` : "none", alignSelf: paper ? "flex-start" : "stretch" }}>
          {chapErr && (
            <div style={{ fontSize: 13, color: T.err, fontFamily: F_MONO, padding: paper ? "10px 12px" : 0 }}>Manual unavailable.</div>
          )}
          {!chapErr && chapters.length === 0 && (
            <div style={{ fontSize: 13, color: T.sub, fontFamily: F_MONO, padding: paper ? "10px 12px" : 0 }}>Loading chapters…</div>
          )}
          {chapters.map((c, ci) => {
            const on = c.id === selId;
            return (
              <button key={c.id} className="kg-tt-btn" onClick={() => openChapter(c.id)}
                style={{ textAlign: "left", background: on ? T.railBgOn : T.railBg,
                  border: paper ? "none" : `1px solid ${on ? T.railBdOn : T.railBd}`,
                  borderTop: paper && ci > 0 ? `1px solid ${FP.rule}` : (paper ? "none" : undefined),
                  borderRadius: T.radius, padding: "9px 11px", minHeight: 40,
                  cursor: "pointer", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: paper ? FP_COND : F_COND, fontStretch: paper ? "75%" : undefined,
                  fontWeight: paper ? 700 : undefined, fontSize: 13.5, letterSpacing: 1, textTransform: "uppercase",
                  color: on ? T.railTxOn : T.railTx }}>{c.label}</span>
                <span style={{ fontSize: 11, fontFamily: F_MONO, color: on ? T.railTxOn : T.faint,
                  flexShrink: 0 }}>{fmtKm(c.lines)}</span>
              </button>
            );
          })}
        </div>

        {/* pane */}
        <div className="kg-tt-reader-pane" style={{ flex: 1, minWidth: 0, border: `1px solid ${T.paneBd}`,
          borderRadius: T.radius ? 10 : 0, background: T.paneBg,
          display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* pane header */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${paper ? FP.rule : LINE}`, background: T.headBg }}>
            <span style={{ fontFamily: paper ? FP_COND : F_COND, fontStretch: paper ? "75%" : undefined,
              fontWeight: paper ? 700 : undefined, fontSize: 13.5, letterSpacing: 2, textTransform: "uppercase",
              color: selId ? T.headTx : T.sub }}>{selId ? selLabel : "No chapter open"}</span>
            {selId && !loadingChap && (
              <span style={{ fontSize: 11.5, fontFamily: F_MONO, color: paper ? FP.mid : T.faint }}>{fmtKm(lines.length)} lines</span>
            )}
          </div>
          {/* pane body — the only internally-scrolling region */}
          <div ref={paneRef} className="kg-tt-scrollpane"
            style={{ maxHeight: 460, minHeight: 200, overflowY: "auto", padding: "10px 4px 12px" }}>
            {!selId && !loadingChap && (
              <div style={{ fontSize: 13.5, color: T.sub, fontFamily: F_MONO, padding: "24px 12px" }}>
                Select a chapter from the rail, or search above.
              </div>
            )}
            {loadingChap && (
              <div style={{ fontSize: 13.5, color: T.sub, fontFamily: F_MONO, padding: "24px 12px" }}>Loading chapter…</div>
            )}
            {!loadingChap && selId && chapReadErr && (
              <div style={{ fontSize: 13.5, color: T.err, fontFamily: F_MONO, padding: "24px 12px" }}>
                This chapter could not be read.
              </div>
            )}
            {!loadingChap && selId && !chapReadErr && rows}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mod status pill — same shape as StatusPill, mapped through MOD_STATUS_META ─
function ModStatusPill({ status }) {
  const m = MOD_STATUS_META[status] || MOD_STATUS_META.installed;
  return (
    <span style={{ fontSize: 12.5, fontFamily: F_MONO, fontWeight: 700, letterSpacing: 2,
      padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap",
      color: m.filled ? "#160a0b" : m.color,
      background: m.filled ? m.color : mix(m.color, 11),
      border: `1px solid ${m.filled ? m.color : mix(m.color, 40)}` }}>
      {m.label}
    </span>
  );
}

// ── Mod status toggle — inline 3-way segmented control so a mod's status can be
// flipped from the read view without entering EDIT (writes straight to the row). ─
function ModStatusToggle({ status, onPick }) {
  return (
    <div className="kg-tt-modtoggle" style={{ display: "inline-flex", marginTop: 11, border: `1px solid ${LINE_STR}`,
      borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
      {["installed", "stock", "planned", "wishlist"].map((v, i) => {
        const on = status === v;
        const c = (MOD_STATUS_META[v] || MOD_STATUS_META.installed).color;
        return (
          <button key={v} className="kg-tt-btn" onClick={() => onPick(v)}
            style={{ background: on ? mix(c, 11) : "transparent",
              border: "none", borderLeft: i > 0 ? `1px solid ${LINE_STR}` : "none",
              color: on ? c : STEEL_DIM, fontFamily: F_MONO, fontSize: 12, fontWeight: 700,
              letterSpacing: 1.5, padding: "3px 8px", cursor: "pointer" }}>
            {v.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ── Inline name rename — click a card's title to retitle that piece of gear without
// entering EDIT (writes straight to the row, same as the status toggle). Enter or
// blur commits, Escape reverts; an empty name is refused so a stray click can never
// wipe the title. ─────────────────────────────────────────────────────────────
function InlineName({ value, onCommit, paper }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const open = () => { setDraft(value || ""); setEditing(true); };
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter")  { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
        }}
        style={paper
          ? { ...ppInput, fontFamily: FP_COND, fontStretch: "80%", fontSize: 16, fontWeight: 700, padding: "3px 7px" }
          : { ...inputBase, fontFamily: F_UI, fontSize: 15, fontWeight: 600, padding: "3px 7px" }} />
    );
  }
  return (
    <div role="button" tabIndex={0} title="Click to rename" onClick={open}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      style={paper
        ? { fontFamily: FP_COND, fontStretch: "80%", fontSize: 17, fontWeight: 700, color: FP.ink, lineHeight: 1.15, cursor: "text" }
        : { fontFamily: F_UI, fontSize: 15, fontWeight: 600, color: BONE, lineHeight: 1.3, cursor: "text" }}>
      {value}
    </div>
  );
}

// ── Mod cost totals — a running price per status bucket (installed·owned / planned /
// wishlist). Costs are parsed + summed per currency; unpriced parts are simply skipped. ─
function ModsTotals({ mods }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
      {["installed", "stock", "planned", "wishlist"].map(st => {
        const meta  = MOD_STATUS_META[st] || MOD_STATUS_META.installed;
        const items = (mods || []).filter(m => (m.status || "installed") === st);
        return (
          <div key={st} style={{ flex: "1 1 140px", minWidth: 132, background: GUN2,
            border: `1px solid ${LINE}`, borderLeft: `2px solid ${meta.color}`, borderRadius: 10,
            padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontFamily: F_MONO, letterSpacing: 2, fontWeight: 700, color: meta.color }}>
              {st === "stock" ? "STOCK · OWNED" : meta.label}
            </div>
            <div style={{ fontSize: 19, fontFamily: F_MONO, fontWeight: 700, color: BONE, marginTop: 4,
              letterSpacing: 0.5 }}>
              {sumCosts(items)}
            </div>
            <div style={{ fontSize: 12.5, fontFamily: F_MONO, color: STEEL_DIM, marginTop: 2 }}>
              {items.length} part{items.length === 1 ? "" : "s"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── GEAR — the build book: what's on the bike and what's next ─────────────────
function ModsView({ mods, edit }) {
  const [linkDraft, setLinkDraft] = useState("");
  const [adding, setAdding] = useState(false);
  if (edit.on) {
    return (
      <div style={{ animation: "ttFade .3s ease" }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>GEAR</h2>
        <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "6px 0 18px" }}>
          What's on the bike, what's planned, what's on the wishlist.
        </p>
        <ModsTotals mods={mods} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mods.map((mod, i) => (
            <div key={mod.id || `m-${i}`} style={{ background: GUN2, border: `1px solid ${LINE}`, borderRadius: 10,
              padding: "13px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <TInput value={mod.part} onChange={v => edit.updRow("mods", i, "part", v)} placeholder="Part (e.g. Vance & Hines Shortshots)" />
                </div>
                <DelBtn onClick={() => edit.delRow("mods", i)} />
              </div>
              <div className="kg-tt-fieldgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 9 }}>
                <EField label="CATEGORY"><TInput value={mod.category} onChange={v => edit.updRow("mods", i, "category", v)} placeholder="Exhaust" /></EField>
                <EField label="STATUS">
                  <TSelect value={mod.status} onChange={v => edit.updRow("mods", i, "status", v)}
                    options={[{ value: "installed", label: "installed" }, { value: "stock", label: "stock" }, { value: "planned", label: "planned" }, { value: "wishlist", label: "wishlist" }]} />
                </EField>
                <EField label="COST"><TInput value={mod.cost} onChange={v => edit.updRow("mods", i, "cost", v)} placeholder="€620" mono /></EField>
                <EField label="DATE"><TInput value={mod.date} onChange={v => edit.updRow("mods", i, "date", v)} placeholder="YYYY-MM-DD" mono /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <EField label="LINK"><TInput mono value={mod.link} onChange={v => edit.updRow("mods", i, "link", v)} placeholder="https://…" /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <EField label="IMAGE URL"><TInput mono value={mod.image} onChange={v => edit.updRow("mods", i, "image", v)} placeholder="https://…/photo.jpg, auto-filled from the link, or paste your own" /></EField>
              </div>
              <div style={{ marginTop: 9 }}>
                <TInput value={mod.note} onChange={v => edit.updRow("mods", i, "note", v)} placeholder="Note (optional)" />
              </div>
            </div>
          ))}
          <AddBtn label="ADD ITEM"
            onClick={() => edit.addRow("mods", { id: `m${Date.now()}`, part: "", category: "", link: "", image: "", date: "", cost: "", status: "installed", note: "" })} />
        </div>
      </div>
    );
  }
  // Drop a pasted product link as a PLANNED mod — no EDIT mode needed; status set later.
  // Fetch the page preview (og:image + title) first so the mod lands with a picture;
  // the preview is best-effort — a miss never blocks the capture.
  const submitLink = async () => {
    const v = linkDraft.trim();
    if (!v || adding) return;
    setAdding(true);
    let image = "", title = "", price = "";
    try {
      const r = await fetch(`/api/link-preview?url=${encodeURIComponent(v)}`);
      if (r.ok) { const d = await r.json(); image = d.image || ""; title = d.title || ""; price = d.price || ""; }
    } catch { /* preview is best-effort — never block the capture */ }
    edit.addRow("mods", { id: `m${Date.now()}`, part: title || hostFromUrl(v), category: "", link: v, image, date: "", cost: price, status: "planned", note: "" });
    setLinkDraft(""); setAdding(false);
  };
  return (
    <div style={{ animation: "ttFade .3s ease" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontFamily: F_COND, fontSize: 14, letterSpacing: 3, color: BONE, fontWeight: 700, margin: 0,
          textTransform: "uppercase" }}>GEAR</h2>
        <span style={{ fontSize: 13, fontFamily: F_MONO, color: STEEL_DIM }}>{mods.length} items</span>
      </div>
      <p style={{ fontSize: 13.5, color: STEEL_DIM, margin: "0 0 18px" }}>
        The build book: parts, mods and kit — what's on the bike and what's next.
      </p>

      <ModsTotals mods={mods} />

      {/* quick-add — paste a product link, lands as PLANNED, sort it later (works outside EDIT) */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitLink(); } }}
            placeholder="https://… paste a product link"
            style={{ ...inputBase, fontFamily: F_MONO, flex: 1 }} />
          <button className="kg-tt-btn" onClick={submitLink} disabled={!linkDraft.trim() || adding}
            style={{ background: (!linkDraft.trim() || adding) ? GUN3 : "var(--tt-seg-on)",
              border: `1px solid ${LINE_STR}`, borderRadius: 6, color: (!linkDraft.trim() || adding) ? STEEL_DIM : "var(--tt-seg-on-text)",
              fontSize: 13, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F_MONO,
              padding: "0 18px", cursor: (!linkDraft.trim() || adding) ? "default" : "pointer", flexShrink: 0 }}>
            {adding ? "…" : "Add"}
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: FAINT, fontFamily: F_MONO, marginTop: 7, lineHeight: 1.5 }}>
          Paste a product link: it lands as PLANNED. Set the status below; changes save automatically.
        </div>
      </div>

      {mods.length === 0 && (
        <div style={{ color: STEEL_DIM, fontSize: 14, padding: "30px 0" }}>No parts yet, paste a link above, or press EDIT for the full form.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {mods.map((mod, i) => {
          const m = MOD_STATUS_META[mod.status] || MOD_STATUS_META.installed;
          return (
            <div key={mod.id || `${mod.part}-${i}`} className="kg-tt-card"
              style={{ background: GUN2, border: `1px solid ${LINE}`, borderLeft: `2px solid ${m.color}`,
                borderRadius: 10, padding: "14px 16px" }}>
              {mod.image && (
                <img src={mod.image} alt={mod.part} loading="lazy"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                  style={{ display: "block", width: "calc(100% + 32px)", height: 130, objectFit: "cover",
                    margin: "-14px -16px 12px", maxWidth: "none", background: BLACK,
                    borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottom: `1px solid ${LINE}` }} />
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineName value={mod.part} onCommit={v => edit.updRow("mods", i, "part", v)} />
                  {mod.category && (
                    <span style={{ display: "inline-block", fontSize: 12.5, fontFamily: F_MONO, color: STEEL,
                      background: mix(CHROME, 7), border: `1px solid ${mix(CHROME, 20)}`, borderRadius: 4,
                      padding: "1px 7px", marginTop: 6 }}>{mod.category}</span>
                  )}
                </div>
                <ModStatusPill status={mod.status} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 11,
                fontSize: 13, fontFamily: F_MONO }}>
                {mod.cost && <span style={{ color: CHROME, fontWeight: 600 }}>{mod.cost}</span>}
                {mod.date && <span style={{ color: STEEL }}>{mod.date}</span>}
                {mod.link && (
                  <a href={mod.link} target="_blank" rel="noopener noreferrer"
                    style={{ color: CHROME, fontWeight: 600, textDecoration: "none" }}>VIEW PART ↗</a>
                )}
              </div>

              {/* inline status toggle — flip installed/planned/wishlist without entering EDIT */}
              <ModStatusToggle status={mod.status} onPick={v => edit.updRow("mods", i, "status", v)} />

              {mod.note && (
                <div style={{ fontSize: 13, color: STEEL_DIM, marginTop: 10, lineHeight: 1.55 }}>{mod.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
