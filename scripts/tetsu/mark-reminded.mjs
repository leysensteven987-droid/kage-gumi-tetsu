/**
 * @vibe-author STLE @version 1 @date 06AUG26 @comment mark-reminded.mjs — stamp data/tetsu/reminders.json after a PushNotification actually sent. ONLY writer of reminders.json; never touches garage.json.
 */

// ─── Tetsu 鉄 — reminder-sent stamp ─────────────────────────────────────────────
// Usage: node scripts/tetsu/mark-reminded.mjs --bike <bikeId> --task <taskId> [--dry-run]
//
// Called once per item AFTER the sched:tetsu-service-check mission has actually
// called PushNotification for it — never before, and never on a failed push (no
// retry logic here or anywhere in this pipeline; a missed push just gets picked
// up again on the next run since nothing was stamped). Shape written:
//   { "<bikeId>": { "<taskId>": "<ISO timestamp>" } }
// Read back by scripts/tetsu/tetsu-service-check.mjs for the 7-day cooldown gate.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT      = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REMINDERS_FILE = join(REPO_ROOT, 'data', 'tetsu', 'reminders.json')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]
    if (!raw.startsWith('--')) continue
    const key = raw.slice(2)
    if (key === 'dry-run') { args.dryRun = true; continue }
    args[key] = argv[i + 1]
    i++
  }
  return args
}

function readReminders() {
  try { return JSON.parse(readFileSync(REMINDERS_FILE, 'utf8')) } catch { return {} }
}

function main() {
  const { bike, task, dryRun } = parseArgs(process.argv.slice(2))
  if (!bike || !task) {
    console.error('Usage: node scripts/tetsu/mark-reminded.mjs --bike <bikeId> --task <taskId> [--dry-run]')
    process.exit(1)
  }

  const reminders = readReminders()
  reminders[bike] = reminders[bike] || {}
  const ts = new Date().toISOString()
  reminders[bike][task] = ts

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, bike, task, ts }, null, 2))
    return
  }

  mkdirSync(dirname(REMINDERS_FILE), { recursive: true })
  writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2))
  console.log(JSON.stringify({ ok: true, bike, task, ts }, null, 2))
}

main()
