/**
 * @vibe-author STLE @version 1 @date 06AUG26 @comment calc-maintenance-status.mjs — pure interval-math scorer for Tetsu's garage schedule (DUE/SOON/OK), no I/O
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Tetsu 鉄 — maintenance interval scoring ───────────────────────────────────
// A garage `schedule` item can carry a km interval, a month interval, or both
// (e.g. "oil": every 8000 km OR 12 months, whichever comes first). This module
// scores one bike against its schedule with no side effects — it never reads or
// writes garage.json/reminders.json. Callers (the /api/tetsu/garage route, the
// nightly check script) own all I/O.
//
// Progress is a ratio: 0 = just serviced, 1.0 = exactly at the interval, >1.0 =
// overdue. When BOTH axes apply, the WORSE (higher-progress) axis wins — a task
// serviced recently by km but overdue by date is still DUE. This is the "tighter
// interval wins" rule from the spec.

const MS_PER_DAY   = 24 * 60 * 60 * 1000
// Average month length — good enough for a maintenance reminder (no calendar
// month-length juggling needed; a threshold a few hours either side of the
// nominal date is not a meaningful difference for a service interval).
const MS_PER_MONTH = 30.44 * MS_PER_DAY

const SOON_THRESHOLD = 0.8
const DUE_THRESHOLD  = 1.0

/**
 * progress = (current - last) / interval, or null if the interval axis doesn't apply.
 * @param {number} current  odometer km, or Date.now() ms
 * @param {number} last     lastKm, or lastDate ms
 * @param {number|null} interval  intervalKm, or intervalMonths converted to ms
 */
function axisProgress(current, last, interval) {
  if (interval == null || !(interval > 0)) return null
  return (current - last) / interval
}

/**
 * Score every item in `schedule` against `bike`. Pure function — no I/O.
 *
 * @param {{odometer?: number}} bike
 * @param {Array<{id: string, task: string, intervalKm?: number|null, intervalMonths?: number|null,
 *   lastKm?: number, lastDate?: string}>} schedule
 * @returns {Array<{taskId: string, task: string, status: 'OK'|'SOON'|'DUE', progress: number,
 *   daysOverdue?: number, kmOverdue?: number}>}
 */
export function calcMaintenanceStatus(bike, schedule) {
  const odometer = Number(bike?.odometer) || 0
  const nowMs    = Date.now()
  const out = []

  for (const task of Array.isArray(schedule) ? schedule : []) {
    if (!task || typeof task !== 'object') continue

    // "No lastKm" / "no lastDate" — the field is genuinely absent (not the number/string
    // 0/""), which only happens on a malformed entry. A real garage.json item always
    // carries lastKm:0 (never serviced) or lastDate:"" (no date on file) explicitly, and
    // those ARE valid history (odometer 0 progress). Skip only when NEITHER axis has any
    // history at all to measure from.
    const hasLastKm   = typeof task.lastKm === 'number'
    const hasLastDate = typeof task.lastDate === 'string' && task.lastDate.trim() !== ''
    if (!hasLastKm && !hasLastDate) continue

    const lastKm     = hasLastKm ? task.lastKm : 0
    const lastDateMs = hasLastDate ? new Date(task.lastDate).getTime() : 0
    // A malformed lastDate string (NaN) is treated the same as "no lastDate" — epoch —
    // rather than poisoning the whole task with a NaN progress.
    const lastDateSafeMs = Number.isFinite(lastDateMs) ? lastDateMs : 0

    const intervalMonthsMs = task.intervalMonths != null ? task.intervalMonths * MS_PER_MONTH : null

    const kmProgress   = axisProgress(odometer, lastKm, task.intervalKm ?? null)
    const dateProgress = axisProgress(nowMs, lastDateSafeMs, intervalMonthsMs)

    const progresses = [kmProgress, dateProgress].filter(p => p != null && Number.isFinite(p))
    if (!progresses.length) continue // both intervals null/invalid — nothing to score

    const progress = Math.max(...progresses)
    const status = progress >= DUE_THRESHOLD ? 'DUE' : progress >= SOON_THRESHOLD ? 'SOON' : 'OK'

    const entry = { taskId: task.id, task: task.task, status, progress }

    if (kmProgress != null && kmProgress >= DUE_THRESHOLD && task.intervalKm) {
      entry.kmOverdue = Math.round(odometer - lastKm - task.intervalKm)
    }
    if (dateProgress != null && dateProgress >= DUE_THRESHOLD && intervalMonthsMs) {
      entry.daysOverdue = Math.round((nowMs - lastDateSafeMs - intervalMonthsMs) / MS_PER_DAY)
    }

    out.push(entry)
  }

  return out
}

// ─── CLI mode ───────────────────────────────────────────────────────────────
// `node scripts/tetsu/calc-maintenance-status.mjs` — scores the live garage
// corpus (first bike) and prints the result as JSON. Read-only: never touches
// garage.json. Used by the nightly service-check script and for manual spot
// checks; not required for the exported function itself.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { loadGarageCorpus } = await import('./load-garage.mjs')
  const garage = loadGarageCorpus()
  const bike   = garage.bikes?.[0] || {}
  const result = calcMaintenanceStatus(bike, garage.schedule)
  console.log(JSON.stringify({ bikeId: bike.id || null, odometer: bike.odometer ?? null, status: result }, null, 2))
}
