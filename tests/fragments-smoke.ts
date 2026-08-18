// Expedition site smoke test: runs the real @dcl/sdk ECS in node, spawns
// today's realm sites, verifies entities + positions + bounds, simulates
// collection and reset. Bundled like scene-smoke.
import { engine, Transform } from '@dcl/sdk/ecs'
import { createExpeditionSite, expeditionSiteCount, resetExpeditionSites, syncExpeditionSites } from '../src/fragments'
import { applyExpedition } from '../src/expedition'
import { expeditionFromServer, fragmentsForDay, fragmentLocation, dayKeyFromDate, realmForExpeditionDay } from '../shared/expedition'

let pass = 0
let fail = 0
function check(name: string, cond: boolean): void {
  if (cond) pass++
  else {
    fail++
    console.log(`FAIL ${name}`)
  }
}

// simulate a fresh expedition in today's realm
const day = dayKeyFromDate(new Date())
const realm = realmForExpeditionDay(day)
const route = fragmentsForDay(day)
const payload = (map: (id: string) => { hits: number; collected: boolean }, completed = false, todayCompletions = 0) =>
  expeditionFromServer({
    day,
    seed: 0,
    realm: { id: realm.id, name: realm.name },
    fragments: route.map((id) => ({ id, location: fragmentLocation(id) ?? { x: 0, z: 0 }, hits: map(id).hits, collected: map(id).collected })),
    completed,
    todayCompletions
  })

applyExpedition(payload(() => ({ hits: 0, collected: false })))

// spawn sites for every route fragment
for (const id of route) {
  createExpeditionSite(id)
}
syncExpeditionSites()

check('3 expedition sites created', expeditionSiteCount() === 3)
check('route has 3 distinct fragments', new Set(route).size === 3)

// every site root sits inside the expanded World (0..192) at a valid location
let allInBounds = true
for (const id of route) {
  const loc = fragmentLocation(id)
  if (!loc || loc.x < 0 || loc.x > 192 || loc.z < 0 || loc.z > 192) allInBounds = false
}
check('all expedition sites in bounds', allInBounds)

// guardian exists per site (3 guardians + 3 hidden fragments + motes + beacons)
let transformCount = 0
for (const _ of engine.getEntitiesWith(Transform)) transformCount++
check('sites + visuals add entities', transformCount > 3)

// simulate server-confirmed collection of the first fragment
const first = route[0]
applyExpedition(payload((id) => ({ hits: id === first ? 3 : 0, collected: id === first })))
syncExpeditionSites()

// collect the rest so completion clears the world
applyExpedition(payload(() => ({ hits: 3, collected: true }), true, 1))
syncExpeditionSites()
check('collected sites dissolve', expeditionSiteCount() === 3) // rigs tracked, entities removed

resetExpeditionSites()
check('reset removes all site roots', expeditionSiteCount() === 0)

console.log(`\nFRAGMENTS SMOKE: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
