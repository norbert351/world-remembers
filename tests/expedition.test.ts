// Phase E expedition tests: deterministic daily routes, client state,
// provider behavior, validation, failure handling. Pure + stub-fetch, no
// engine needed (expedition.ts has no engine imports).
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  applyExpedition,
  completeExpedition,
  collectFragment,
  dispelGuardian,
  expeditionCollectedCount,
  expeditionCompleted,
  expeditionFragments,
  expeditionHits,
  expeditionIsCollected,
  expeditionState,
  expeditionTodayCompletions,
  loadExpedition,
  resetExpedition,
  setExpeditionIdentityResolver
} from '../src/expedition'
import {
  dailySeed,
  dayKeyFromDate,
  expeditionFromServer,
  fragmentLocation,
  fragmentsForDay,
  isFragmentId,
  realmForExpeditionDay,
  zoneOf
} from '../shared/expedition'
import { ALL_OBJECTIVE_IDS, realmOfObjective } from '../shared/realms'

const PLAYER = '0x' + '1'.repeat(40)

function routePayload(day: string, progress: Partial<Record<string, { hits?: number; collected?: boolean }>> = {}) {
  const realm = realmForExpeditionDay(day)
  const route = fragmentsForDay(day)
  return {
    day,
    seed: dailySeed(day),
    realm: { id: realm.id, name: realm.name },
    fragments: route.map((id) => ({
      id,
      location: fragmentLocation(id) ?? { x: 0, z: 0 },
      realmId: realm.id,
      hits: progress[id]?.hits ?? 0,
      collected: progress[id]?.collected ?? false
    })),
    completed: false,
    todayCompletions: 0
  }
}

afterEach(() => {
  resetExpedition()
  setExpeditionIdentityResolver(() => PLAYER)
})

test('daily seed is deterministic and day-dependent', () => {
  assert.equal(dailySeed('2026-08-16'), dailySeed('2026-08-16'))
  assert.notEqual(dailySeed('2026-08-16'), dailySeed('2026-08-17'))
  assert.equal(dayKeyFromDate(new Date(2026, 7, 16)), '2026-08-16')
})

test('routes differ between days and use valid fragment ids', () => {
  const days = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']
  const routes = days.map((d) => fragmentsForDay(d))
  for (const r of routes) {
    assert.equal(r.length, 3)
    for (const id of r) assert.ok(isFragmentId(id))
    assert.equal(new Set(r).size, 3, 'no duplicate fragments in a day')
  }
  const sets = new Set(routes.map((r) => r.join(',')))
  assert.ok(sets.size >= 2, 'not all days identical')
})

// One realm per day, three objectives within that realm, all inside the
// expanded World scene (0..192m) and within a realm-local region.
test('all objective locations are inside the World and within their realm', () => {
  for (const id of ALL_OBJECTIVE_IDS) {
    const pos = fragmentLocation(id)
    assert.ok(pos, `${id} has a position`)
    assert.ok(pos!.x >= 0.5 && pos!.x <= 191.5, `${id} x in bounds`)
    assert.ok(pos!.z >= 0.5 && pos!.z <= 191.5, `${id} z in bounds`)
    const realm = realmOfObjective(id)
    assert.ok(realm, `${id} belongs to a realm`)
    // realm-local coords stay inside the 48x48 region
    const obj = realm!.objectives.find((o) => o.id === id)
    assert.ok(obj!.local.x >= 0 && obj!.local.x <= 48, `${id} local x`)
    assert.ok(obj!.local.z >= 0 && obj!.local.z <= 48, `${id} local z`)
  }
})

test('zone labels map to the owning realm name', () => {
  const realm = realmForExpeditionDay('2026-08-16')
  const id = realm.objectives[0].id
  assert.equal(zoneOf(id), realm.name)
})

test('expedition loads and applies server state', async () => {
  const day = dayKeyFromDate(new Date())
  const payload = routePayload(day)
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(payload)
    },
    async dispel() {
      return expeditionFromServer(payload)
    },
    async collect() {
      return expeditionFromServer(payload)
    },
    async complete() {
      return expeditionFromServer(payload)
    }
  }
  const ok = await loadExpedition()
  assert.equal(ok, true)
  assert.equal(expeditionState.loaded, true)
  assert.equal(expeditionFragments().length, 3)
  assert.equal(expeditionCollectedCount(), 0)
  assert.equal(expeditionCompleted(), false)
  assert.equal(expeditionTodayCompletions(), 0)
})

test('dispel updates hits from server response only', async () => {
  const day = dayKeyFromDate(new Date())
  const route = fragmentsForDay(day)
  const id = route[0]
  const base = routePayload(day)
  const afterHit = routePayload(day, { [id]: { hits: 1 } })
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(base)
    },
    async dispel(fragmentId) {
      assert.equal(fragmentId, id)
      return expeditionFromServer(afterHit)
    },
    async collect() {
      throw new Error('unused')
    },
    async complete() {
      throw new Error('unused')
    }
  }
  await loadExpedition()
  const ok = await dispelGuardian(id)
  assert.equal(ok, true)
  assert.equal(expeditionHits(id), 1)
})

test('failed dispel does not mutate state', async () => {
  const day = dayKeyFromDate(new Date())
  const id = fragmentsForDay(day)[0]
  const payload = routePayload(day)
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(payload)
    },
    async dispel() {
      throw new Error('network down')
    },
    async collect() {
      throw new Error('unused')
    },
    async complete() {
      throw new Error('unused')
    }
  }
  await loadExpedition()
  const ok = await dispelGuardian(id)
  assert.equal(ok, false)
  assert.equal(expeditionHits(id), 0)
  assert.equal(expeditionState.dispelError, true)
})

test('collect marks the fragment collected from server state', async () => {
  const day = dayKeyFromDate(new Date())
  const route = fragmentsForDay(day)
  const id = route[0]
  const base = routePayload(day, { [id]: { hits: 3 } })
  const after = routePayload(day, { [id]: { hits: 3, collected: true } })
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(base)
    },
    async dispel() {
      throw new Error('unused')
    },
    async collect(fragmentId) {
      assert.equal(fragmentId, id)
      return expeditionFromServer(after)
    },
    async complete() {
      throw new Error('unused')
    }
  }
  await loadExpedition()
  const ok = await collectFragment(id)
  assert.equal(ok, true)
  assert.equal(expeditionIsCollected(id), true)
  assert.equal(expeditionCollectedCount(), 1)
})

test('complete returns the completion state', async () => {
  const day = dayKeyFromDate(new Date())
  const route = fragmentsForDay(day)
  const base = routePayload(day)
  for (const id of route) base.fragments[base.fragments.findIndex((f) => f.id === id)].hits = 3
  const done = routePayload(day)
  done.completed = true
  done.todayCompletions = 1
  for (const id of route) done.fragments[done.fragments.findIndex((f) => f.id === id)].collected = true
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(base)
    },
    async dispel() {
      throw new Error('unused')
    },
    async collect() {
      throw new Error('unused')
    },
    async complete() {
      return expeditionFromServer(done)
    }
  }
  await loadExpedition()
  const ok = await completeExpedition()
  assert.equal(ok, true)
  assert.equal(expeditionCompleted(), true)
  assert.equal(expeditionTodayCompletions(), 1)
})

test('API failure does not create fake expedition state', async () => {
  expeditionState.provider = {
    async load() {
      throw new Error('offline')
    },
    async dispel() {
      throw new Error('offline')
    },
    async collect() {
      throw new Error('offline')
    },
    async complete() {
      throw new Error('offline')
    }
  }
  const ok = await loadExpedition()
  assert.equal(ok, false)
  assert.equal(expeditionState.loadError, true)
  assert.equal(expeditionState.state, null)
  assert.equal(expeditionFragments().length, 0)
})

test('malformed server payload is rejected', () => {
  const bad = [
    null,
    {},
    { day: 'nope', seed: 1, fragments: [], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 'x', fragments: [], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 1, fragments: [{ id: 'zzz' }], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 1, fragments: [], completed: false, todayCompletions: -2 },
    { day: '2026-08-16', seed: 1, fragments: [], completed: 'yes', todayCompletions: 0 },
    { day: '2026-08-16', seed: 1, fragments: [], completed: false, todayCompletions: 0 }
  ]
  for (const b of bad) assert.throws(() => expeditionFromServer(b))
})

test('duplicate taps do not duplicate progress (server is authority)', async () => {
  const day = dayKeyFromDate(new Date())
  const id = fragmentsForDay(day)[0]
  const payload = routePayload(day, { [id]: { hits: 2 } })
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(payload)
    },
    async dispel() {
      // server caps at 3; the client just applies whatever comes back
      return expeditionFromServer(routePayload(day, { [id]: { hits: 3 } }))
    },
    async collect() {
      throw new Error('unused')
    },
    async complete() {
      throw new Error('unused')
    }
  }
  await loadExpedition()
  await dispelGuardian(id)
  await dispelGuardian(id)
  assert.equal(expeditionHits(id), 3, 'server response is applied as-is')
})

test('reload preserves expedition state through the provider', async () => {
  const day = dayKeyFromDate(new Date())
  const route = fragmentsForDay(day)
  const id = route[0]
  const afterCollect = routePayload(day, { [id]: { hits: 3, collected: true } })
  // session 1
  expeditionState.provider = {
    async load() {
      return expeditionFromServer(afterCollect)
    },
    async dispel() {
      throw new Error('unused')
    },
    async collect() {
      throw new Error('unused')
    },
    async complete() {
      throw new Error('unused')
    }
  }
  await loadExpedition()
  assert.equal(expeditionIsCollected(id), true)
  // session 2 (simulated reload): fresh state, same server truth
  resetExpedition()
  const ok = await loadExpedition()
  assert.equal(ok, true)
  assert.equal(expeditionIsCollected(id), true, 'server still reports the collection')
})
