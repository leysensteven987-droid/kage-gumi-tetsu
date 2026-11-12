# Tetsu 鉄 — night plan

The night shift (`nightly/run.mjs`, PM2 `kage-gumi-tetsu-nightly`, 02:00 on Steven's personal
Claude seat) takes **one item per night** from this file, works it in a throwaway worktree, gates
it, deploys it live and smoke-tests it. Rules for every night: `nightly/BRIEF.md`.

**How the night picks:** a recurring item due today → a `[~]` partial → the first open item of
tonight's lane (lanes alternate: `REL` one night, `TUNE` the next) → any open item.
**Legend:** `[ ]` open · `[~]` partial · `[x]` done · `[!]` blocked on Steven ·
tags `[opus]` harder work, Opus model · `[branch]` parked on a review branch, never deployed ·
`[next]` taken before the lane rotation · `[hold]` never taken unattended · `[every:<day>]` recurring.
**Steven:** reorder freely, tag `[hold]` to stop an item, drop `.nightly/PAUSED` in the repo to stop the shift.

> **Box note (12NOV26):** the PM2 app `kage-gumi-tetsu` is **stopped** on the box. The night lands
> code on main but does not start a stopped app — start it yourself when you want it live.

## Release target — what "public" means here

Per-app accounts (Steven, 12NOV26): Tetsu gets its **own** sign-up, sign-in and admin. Today it is
one Forty-Eight, one garage file and Harley's factory manual. Release-ready when:

- Any rider can add their own bikes (any make and model); the Forty-Eight is just one example.
- Every garage, log, mod list and manual belongs to one user; nobody can read another's.
- No copyrighted manual ships to other users; riders upload their own (like Raiden).
- Ask Tetsu runs on a metered API key with per-user caps — not on the owner's Claude login.
- Invite-only sign-up, admin can disable / delete users and reset a password by link.
- Export my data / delete my account work; privacy page and terms exist.

---

## Recurring

- [ ] **R-UPD** Weekly dependency refresh: `npm outdated`, apply patch + minor updates, rebuild, run tests; majors become `[hold]` Inbox items. `[every:sun]`
- [ ] **R-AUDIT** Weekly security pass over the last 7 days of commits: auth, per-user scoping, input validation, SSRF, path handling, secrets; `npm audit --omit=dev`. Fix small, file the rest. `[every:wed]`

## REL — public release lane

- [ ] **REL-01** Test harness and a public health probe. `[next]`
  - `npm test` = `node --test` over `server/**/*.test.mjs` and the existing `scripts/tetsu/*.test.mjs` (calc-maintenance-status already has tests).
  - A helper boots the Express app on an ephemeral port against a temp data dir; first tests for garage GET/POST, manual chapters/search, lock gate.
  - `GET /api/health` → `{ ok, service, version }` answering before the lock, no data.
- [ ] **REL-02** SSRF guard on `GET /api/link-preview` — today it fetches any URL a client sends. Refuse private, loopback, link-local, tailnet and `.local` targets after DNS resolution, cap redirects (re-check each hop), response size and time, only http/https. Tests with a stub resolver. This is the most dangerous route in the app once it is public. `[opus]`
- [ ] **REL-03** Input hardening: `POST /api/garage` validates shape and size (it currently persists whatever arrives), `?id=` on manual chapter is checked against the chapter list (no path traversal), `?q=` length cap, per-IP rate limit on writes, link-preview and chat. Tests per refusal.
- [ ] **REL-04** One data store module `server/store.mjs` with a `userId` (today `"owner"`) for the garage and reminders; no disk layout change yet; tests prove nothing moved.
- [ ] **REL-05** Generic garage model: bikes become a list of any make/model/year with their own fluids, torque table, service schedule and mods; the Forty-Eight data becomes one example seed, not code. Additive migration of today's garage file, keeps the original. `[opus]`
- [ ] **REL-06** Accounts design note `docs/accounts.md`: `node:sqlite` users + sessions, scrypt hashes, cookie signing reused from `server/lock.mjs`, roles `owner|admin|user`, invite codes, admin reset links, `data/users/<id>/` layout, owner migration. Plan only. `[opus]`
- [ ] **REL-07** Accounts, part 1 — behind `AUTH_MODE` (`passphrase` default): users table, sign-in/out, `req.user`, owner bootstrap from env. Passphrase mode unchanged. Tests both modes. `[opus]`
- [ ] **REL-08** Accounts, part 2 — invite-only sign-up, password change, admin reset link, brute-force lockout. Tests. `[opus]`
- [ ] **REL-09** Per-user data behind `AUTH_MODE=accounts`: garage, reminders and uploaded manuals resolve under `data/users/<id>/`; owner files copied (never moved) on first boot. IDOR tests for every route. `[opus]`
- [ ] **REL-10** Manuals per user: upload a PDF (size + type checked, parsed with a time limit) → chapters → search, mirroring Raiden's manual pipeline; the bundled Harley manual stays owner-only and is never served to other users.
- [ ] **REL-11** Ask Tetsu off the owner's Claude login: today `/api/chat` shells out to the `claude` CLI on the owner's subscription, which cannot serve other people. Move to the Anthropic API (`@anthropic-ai/sdk`, key from env) behind one wrapper with per-user and global daily caps, a kill switch, and usage per user. Keep the CLI path only for the owner in passphrase mode. `[opus]`
- [ ] **REL-12** Admin view `/admin`: users, invites, disable, delete-with-data, reset link, storage and chat usage per user. Monochrome-metal styling.
- [ ] **REL-13** Security headers (CSP, nosniff, Referrer-Policy, frame-ancestors) and CSRF (SameSite=Lax + Origin check). Tests.
- [ ] **REL-14** My data: export (JSON + uploaded files) and delete-my-account, tested.
- [ ] **REL-15** New-rider onboarding: add your first bike (make/model/year/odometer), suggested service intervals clearly marked "check your manual", empty states everywhere.
- [ ] **REL-16** Reminders in the app: the nightly reminder script (`scripts/tetsu/`) becomes a per-user, in-app "due soon" list; delivery channel (web push / email) is a decision. `[hold]`
- [ ] **REL-17** Content licensing: the committed factory service manual PDFs and chapter text are Harley-Davidson's copyright — decide whether they leave the public repo (history rewrite is a separate, owner-run job). `[hold]`
- [ ] **REL-18** Privacy page + terms + cookie note, linked from sign-in. Draft only. `[branch]`
- [ ] **REL-19** Ops: request + error logs with request id (no personal data), log rotation, restore runbook for `.nightly/backups`. README updated.

## TUNE — fine-tuning lane

- [ ] **TUNE-01** Service maths: unify `scripts/tetsu/calc-maintenance-status.mjs` with what the UI shows (one source of truth for "due in X km / Y days"), with tests for km-only, time-only and both-whichever-first intervals.
- [ ] **TUNE-02** Manual search quality: stemming / accent folding, phrase match, rank by heading hits, snippet around the match, jump to the exact line. Measure on 10 fixed queries before/after.
- [ ] **TUNE-03** Torque and fluids lookup: a fast "what torque for X" card from the garage data with the manual reference beside it; no number shown without a source.
- [ ] **TUNE-04** Ask Tetsu grounding: retrieval returns cited chapter + line, answers say when the manual does not cover it; a small eval of 10 questions with expected citations, run in tests with a stubbed model.
- [ ] **TUNE-05** Link preview quality: price and image extraction for the common shops (og tags, JSON-LD Product), graceful fallback; fixtures saved as local HTML, no live fetches in tests.
- [ ] **TUNE-06** Offline garage: the service worker keeps the garage, schedule and manual chapters usable with no signal in the garage; edits queue and sync.
- [ ] **TUNE-07** Logbook UX: quick-add a service entry from a due item (prefilled), odometer validation (never goes down without a confirm).
- [ ] **TUNE-08** Accessibility and glare: contrast on the monochrome theme, tap targets ≥ 44 px with gloves in mind, focus rings, labels on icon buttons.
- [ ] **TUNE-09** Performance budget: bundle report on build, flag > 250 KB gzipped, lazy-load the manual reader.

## Inbox

