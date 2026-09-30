/**
 * @vibe-author STLE @version 1 @date 06AUG26 @comment load-garage.mjs — read-only garage corpus loader shared by the CLI/scheduled Tetsu scripts. Mirrors loadTetsuGarage() in frontend/server/index.js, scoped to the bikes+schedule keys this feature needs.
 */

// Standalone scripts (tetsu-service-check.mjs, calc-maintenance-status.mjs's CLI mode)
// can't reach into index.js's in-process loadTetsuGarage() — and shouldn't go over
// HTTP for it either: GET /api/tetsu/garage sits behind KG_AUTH_MODE=enforce and isn't
// on the service-token allowlist (frontend/server/auth.mjs SERVICE_PATHS), on purpose —
// widening that surface for a personal convenience script is not worth it. This reads
// the same files the server does, directly off disk. Read-only: never writes.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT  = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GARAGE_DIR = join(REPO_ROOT, '_output', 'tetsu', 'garage')
const SEED_FILE  = join(REPO_ROOT, 'data', 'tetsu', 'garage.sample.json')

/** @returns {{bikes: Array, schedule: Array}} */
export function loadGarageCorpus() {
  try {
    const merged = { bikes: [], schedule: [] }
    let found = false
    for (const e of readdirSync(GARAGE_DIR, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.json')) continue
      try {
        const g = JSON.parse(readFileSync(join(GARAGE_DIR, e.name), 'utf8'))
        if (Array.isArray(g?.bikes)) { merged.bikes.push(...g.bikes); found = true }
        if (Array.isArray(g?.schedule)) { merged.schedule.push(...g.schedule); found = true }
      } catch {}
    }
    if (found) return merged
  } catch {}
  try {
    const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
    return { bikes: seed.bikes || [], schedule: seed.schedule || [] }
  } catch {}
  return { bikes: [], schedule: [] }
}
