/**
 * calc-maintenance-status.test.mjs — interval math for Tetsu's garage schedule.
 * Run: node scripts/tetsu/calc-maintenance-status.test.mjs
 *
 * calcMaintenanceStatus is a PURE function — no file I/O, no server. These are
 * the three scenarios from the build spec plus the documented edge cases.
 */

import { calcMaintenanceStatus } from './calc-maintenance-status.mjs'

let pass = 0, fail = 0
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}`) }

const byId = (result, id) => result.find(r => r.taskId === id)
const DAY   = 24 * 60 * 60 * 1000
const MONTH = 30.44 * DAY

// ── Scenario 1 — km-based interval: oil every 8000 km ──────────────────────
{
  const oilTask = { id: 'oil', task: 'Engine oil + filter', intervalKm: 8000, intervalMonths: null, lastKm: 0, lastDate: '' }

  const soon = calcMaintenanceStatus({ odometer: 6400 }, [oilTask])
  ok('oil at 6400/8000 km (80%) is SOON', byId(soon, 'oil')?.status === 'SOON')

  const dueAtLine = calcMaintenanceStatus({ odometer: 8000 }, [oilTask])
  ok('oil at exactly 8000/8000 km is DUE', byId(dueAtLine, 'oil')?.status === 'DUE')

  const overdue = calcMaintenanceStatus({ odometer: 9000 }, [oilTask])
  const entry = byId(overdue, 'oil')
  ok('oil past interval is DUE', entry?.status === 'DUE')
  ok('overdue km is reported', entry?.kmOverdue === 1000)

  const fresh = calcMaintenanceStatus({ odometer: 1000 }, [oilTask])
  ok('oil well under interval is OK', byId(fresh, 'oil')?.status === 'OK')
}

// ── Scenario 2 — brand-new bike, no service history (lastKm: 0) ────────────
{
  const schedule = [
    // km-only axis (no intervalMonths), so this one isolates the "0 km -> 0 progress" claim
    // without the date axis's epoch sentinel (see the 'plugs' case below) also driving it DUE.
    { id: 'oil',   task: 'Engine oil + filter', intervalKm: 8000, intervalMonths: null, lastKm: 0, lastDate: '' },
    { id: 'plugs', task: 'Spark plugs (2x)',    intervalKm: null, intervalMonths: 24, lastKm: 0, lastDate: '' },
  ]
  const result = calcMaintenanceStatus({ odometer: 0 }, schedule)
  ok('a bike at 0 km scores 0 progress on a km-only task', byId(result, 'oil')?.progress === 0)
  ok('the km-only task is not DUE on a 0 km bike', byId(result, 'oil')?.status !== 'DUE')
  // The date axis still applies even at 0 km — lastDate "" is epoch, so a task with only
  // a month interval reads as wildly overdue "since 1970". That is correct: it means "no
  // date on file", not "never due" — same behaviour the real garage.json seed has today.
  ok('a date-only task with no lastDate reads as overdue (epoch)', byId(result, 'plugs')?.status === 'DUE')
}

// ── Scenario 3 — date-based interval: spark plugs every 24 months ──────────
{
  const plugsTask = { id: 'plugs', task: 'Spark plugs (2x)', intervalKm: null, intervalMonths: 24, lastKm: 0, lastDate: '' }
  const nowIso = (monthsAgo) => new Date(Date.now() - monthsAgo * MONTH).toISOString()

  const soon = calcMaintenanceStatus({ odometer: 0 }, [{ ...plugsTask, lastDate: nowIso(19.5) }])
  ok('plugs at ~19.5/24 months (81%) is SOON', byId(soon, 'plugs')?.status === 'SOON')

  const due = calcMaintenanceStatus({ odometer: 0 }, [{ ...plugsTask, lastDate: nowIso(24) }])
  ok('plugs at exactly 24 months is DUE', byId(due, 'plugs')?.status === 'DUE')

  const overdue = calcMaintenanceStatus({ odometer: 0 }, [{ ...plugsTask, lastDate: nowIso(26) }])
  ok('plugs 2 months past interval reports daysOverdue', (byId(overdue, 'plugs')?.daysOverdue ?? 0) > 55)

  const fresh = calcMaintenanceStatus({ odometer: 0 }, [{ ...plugsTask, lastDate: nowIso(1) }])
  ok('plugs serviced last month is OK', byId(fresh, 'plugs')?.status === 'OK')
}

// ── Edge cases ───────────────────────────────────────────────────────────────
ok('both intervals null -> task is skipped entirely (nothing to score)',
   calcMaintenanceStatus({ odometer: 9000 }, [{ id: 'x', task: 'X', intervalKm: null, intervalMonths: null, lastKm: 0, lastDate: '' }]).length === 0)

ok('no lastKm AND no lastDate at all -> skipped (can\'t score without history)',
   calcMaintenanceStatus({ odometer: 9000 }, [{ id: 'x', task: 'X', intervalKm: 8000 }]).length === 0)

ok('missing lastKm but present lastDate still scores (date axis)',
   calcMaintenanceStatus({ odometer: 9000 }, [{ id: 'x', task: 'X', intervalKm: 8000, intervalMonths: 6, lastDate: new Date().toISOString() }]).length === 1)

ok('non-array schedule degrades to empty result, not a throw',
   calcMaintenanceStatus({ odometer: 100 }, null).length === 0)

ok('missing bike/odometer degrades to 0, not a throw',
   Array.isArray(calcMaintenanceStatus(undefined, [{ id: 'oil', task: 'Oil', intervalKm: 8000, lastKm: 0, lastDate: '' }])))

{
  // Both axes present: the worse (higher-progress) axis wins the status even when the
  // other axis is nowhere near due.
  const task = { id: 'oil', task: 'Oil', intervalKm: 8000, intervalMonths: 120, lastKm: 0, lastDate: new Date().toISOString() }
  const result = calcMaintenanceStatus({ odometer: 9000 }, [task])
  ok('km overdue wins DUE even though the date axis is fresh', byId(result, 'oil')?.status === 'DUE')
  ok('kmOverdue is reported, daysOverdue is not (date axis not the due one)',
     byId(result, 'oil')?.kmOverdue === 1000 && byId(result, 'oil')?.daysOverdue === undefined)
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`)
process.exit(fail === 0 ? 0 : 1)
