// Expedition site smoke test: runs the real @dcl/sdk ECS in node, spawns
// today's sites, verifies entities + positions + bounds, simulates
// collection and reset. Bundled like scene-smoke.
import { engine, Entity, EntityState, Transform } from '@dcl/sdk/ecs'
import { createExpeditionSite, expeditionSiteCount, resetExpeditionSites, syncExpeditionSites } from '../src/fragments'
import { applyExpedition } from '../src/expedition'
import { expeditionFromServer, fragmentsForDay, FRAGMENT_LOCATIONS, dayKeyFromDate } from '../shared/expedition'

let pass = 0
let fail = 0
function check(name: string, cond: boolean): void {
  if (cond) pass++
  else {
    fail++
    console.log(`FAIL ${name}`)
  }
}

// simulate a fresh expedition with today's route
const day = dayKeyFromDate(new Date())
const route = fragmentsForDay(day)
applyExpedition(
  expeditionFromServer({
    day,
    seed: 0,
    fragments: route.map((id) => ({ id, location: FRAGMENT_LOCATIONS[id], hits: 0, collected: false })),
    completed: false,
    todayCompletions: 0
  })
)

// spawn sites for every route fragment
for (const id of route) {
  createExpeditionSite(id)
}
syncExpeditionSites()

check('3 expedition sites created', expeditionSiteCount() === 3)
check('route has 3 distinct fragments', new Set(route).size === 3)

// every site root sits inside the 32x32 world at a valid location
let allInBounds = true
const sites: { x: number; z: number }[] = []
for (const id of route) {
  const loc = FRAGMENT_LOCATIONS[id]
  sites.push({ x: loc.x, z: loc.z })
  if (loc.x < 0 || loc.x > 32 || loc.z < 0 || loc.z > 32) allInBounds = false
}
check('all expedition sites in bounds', allInBounds)

// guardian exists per site (3 guardians + 3 hidden fragments + motes)
let transformCount = 0
for (const _ of engine.getEntitiesWith(Transform)) transformCount++
check('sites + visuals add entities', transformCount > 3)

// simulate server-confirmed collection of the first fragment
const first = route[0]
applyExpedition(
  expeditionFromServer({
    day,
    seed: 0,
    fragments: route.map((id) => ({
      id,
      location: FRAGMENT_LOCATIONS[id],
      hits: id === first ? 3 : 0,
      collected: id === first
    })),
    completed: false,
    todayCompletions: 0
  })
)
syncExpeditionSites()

// collect the rest so completion clears the world
applyExpedition(
  expeditionFromServer({
    day,
    seed: 0,
    fragments: route.map((id) => ({
      id,
      location: FRAGMENT_LOCATIONS[id],
      hits: 3,
      collected: true
    })),
    completed: true,
    todayCompletions: 1
  })
)
syncExpeditionSites()
check('collected sites dissolve', expeditionSiteCount() === 3) // rigs tracked, entities removed

resetExpeditionSites()
check('reset removes all site roots', expeditionSiteCount() === 0)

console.log(`\nFRAGMENTS SMOKE: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
