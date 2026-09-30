/**
 * @vibe-author STLE @version 1 @date 06AUG26 @comment tetsu-service-check.mjs — nightly Tetsu garage check: finds DUE items not reminded in 7 days, prints the PushNotification payloads to send. Read-only — never mutates garage.json or reminders.json.
 */

// ─── Tetsu 鉄 — service-due reminder check ─────────────────────────────────────
// Run by the sched:tetsu-service-check ryu-mission (buildTetsuServiceCheckPrompt,
// frontend/server/index.js). The mission Bash-runs this script, gets back a list
// of PushNotification payloads to send, calls the PushNotification tool for each,
// then runs mark-reminded.mjs per item it actually pushed. This script itself
// makes NO writes — it loads the garage corpus read-only (load-garage.mjs, the
// same files GET /api/tetsu/garage merges), scores it with the same pure function
// the API route uses (calc-maintenance-status.mjs), and reads the reminders gate
// file. Runs entirely off disk — no HTTP call to kg-api, no auth token needed
// (GET /api/tetsu/garage isn't on the service-token allowlist by design; see
// load-garage.mjs).
//
// Output on stdout is JSON: { generatedAt, dueCount, toRemind: [...] }. Nothing
// is printed to stderr on the happy path so a mission can `JSON.parse` stdout
// directly.

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGarageCorpus } from './load-garage.mjs'
import { calcMaintenanceStatus } from './calc-maintenance-status.mjs'

const REPO_ROOT      = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REMINDERS_FILE = join(REPO_ROOT, 'data', 'tetsu', 'reminders.json')
const REMIND_COOLDOWN_DAYS = 7
const DEEP_LINK       = process.env.TETSU_DEEPLINK || 'https://tetsu.kage-gumi.com/#garage'

function readReminders() {
  try { return JSON.parse(readFileSync(REMINDERS_FILE, 'utf8')) } catch { return {} }
}

// e.g. "11,500 km (100% of 8,000 km interval)" for a km-tracked item, or
// "26 months since last (interval 24 months)" for a date-only item. Prefers the
// axis that actually pushed the item to DUE (kmOverdue over daysOverdue) when both
// axes are present on the task.
function formatProgressPhrase(bike, item) {
  const odometer = Number(bike?.odometer) || 0
  // Reconstruct the PER-AXIS percentage from its own overdue figure — NOT from
  // item.progress, which is the overall max() across both axes (calc-maintenance-
  // status.mjs). Using the overall progress here would print e.g. "5659% of 8,000 km
  // interval" when the DATE axis is what's wildly overdue and the km axis merely
  // crossed 100% — a real bug caught by running this against the live garage (oil:
  // both axes set, lastDate epoch dominates progress, km axis is only 144% on its own).
  if (item.kmOverdue != null && item.intervalKm) {
    const pct = Math.round(100 * (1 + item.kmOverdue / item.intervalKm))
    return `${odometer.toLocaleString()} km (${pct}% of ${item.intervalKm.toLocaleString()} km interval)`
  }
  if (item.daysOverdue != null && item.intervalMonths) {
    const monthsSince = Math.round((item.daysOverdue + item.intervalMonths * 30.44) / 30.44)
    return `${monthsSince} months since last (interval ${item.intervalMonths} months)`
  }
  // Fallback — progress crossed DUE but neither overdue field landed (shouldn't happen
  // given calcMaintenanceStatus always sets one when status is DUE, but never crash a
  // best-effort notification over it).
  return `${Math.round((item.progress || 0) * 100)}% of its service interval`
}

function buildPayload(bike, item) {
  const notePart = item.note ? ` — ${String(item.note).slice(0, 60)}` : ''
  const title = `🏍️ Tetsu Service Due: ${item.task}`
  const body  = `${formatProgressPhrase(bike, item)}${notePart}`
  // The PushNotification tool takes ONE `message` string (<200 chars, one line, no
  // markdown) — no separate title/body/tag/deepLink params. `message` is the field the
  // mission actually passes to the tool; title/body/tag/deepLink stay in the payload for
  // logging + OUR OWN dedupe bookkeeping (reminders.json is keyed by tag's bikeId/taskId),
  // not because the tool consumes them.
  const message = `${title} — ${body}`.replace(/\s+/g, ' ').trim().slice(0, 195)
  return {
    bikeId: bike.id,
    taskId: item.id,
    title, body, message,
    tag: `tetsu-service-${bike.id}-${item.id}`,
    deepLink: DEEP_LINK,
  }
}

function main() {
  const garage    = loadGarageCorpus()
  const reminders = readReminders()
  const nowMs      = Date.now()
  const cooldownMs = REMIND_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

  const toRemind = []
  let dueCount = 0

  for (const bike of garage.bikes || []) {
    const scored = calcMaintenanceStatus(bike, garage.schedule)
    for (const item of scored) {
      if (item.status !== 'DUE') continue
      dueCount++
      const lastReminded = reminders?.[bike.id]?.[item.taskId]
      if (lastReminded && (nowMs - new Date(lastReminded).getTime()) < cooldownMs) continue // reminded within 7 days — skip

      // Merge the original schedule item (task/intervalKm/intervalMonths/note) with the
      // scored fields (status/progress/kmOverdue/daysOverdue) — calcMaintenanceStatus
      // returns id under `taskId`, so match back to the source item for its full shape.
      const source = (garage.schedule || []).find(s => s.id === item.taskId) || {}
      toRemind.push(buildPayload(bike, { ...source, id: item.taskId, status: item.status,
        progress: item.progress, kmOverdue: item.kmOverdue, daysOverdue: item.daysOverdue }))
    }
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), dueCount, toRemind }, null, 2))
}

main()
