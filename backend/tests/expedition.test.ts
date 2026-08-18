// Integration tests for the Memory Expedition API: deterministic daily
// route, guardian hits, collection, completion, security (duplicates,
// invalid fragments, old missions, extra fields, client can't self-report).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import { createPool } from '../src/db'
import {
  EXPEDITION,
  dailySeed,
  dayKeyFromDate,
  fragmentLocation,
  fragmentsForDay,
  realmForExpeditionDay,
  zoneOf,
  type ExpeditionFragmentId
} from '../../shared/expedition'
import { ALL_OBJECTIVE_IDS, objectiveWorld } from '../../shared/realms'
import type { Pool } from 'pg'

const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')

const PLAYER = '0x' + '1'.repeat(40)

let pool: Pool
let server: Server
let base: string

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, init)
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function player(n: number): string {
  return '0x' + n.toString(16).padStart(40, '0')
}

before(async () => {
  pool = createPool(testUrl)
  for (const file of ['001_contributions.sql', '002_memory_stones.sql', '003_expedition.sql']) {
    const sql = readFileSync(join(__dirname, '..', 'migrations', file), 'utf8')
    await pool.query(sql)
  }
  const app = createApp(pool)
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await pool.query('TRUNCATE expedition_progress')
  await pool.query('TRUNCATE contributions')
  await pool.query('TRUNCATE stone_memories')
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('GET /expedition returns today\'s deterministic route', async () => {
  const { status, body } = await api(`/expedition?playerId=${PLAYER}`)
  assert.equal(status, 200)
  assert.match(body.day, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(body.seed, dailySeed(body.day))
  assert.equal(body.fragments.length, 3)
  assert.equal(body.completed, false)
  assert.equal(body.todayCompletions, 0)
  // the route matches the deterministic generator
  assert.deepEqual(body.fragments.map((f: any) => f.id), fragmentsForDay(body.day))
})

test('daily seed is deterministic', () => {
  const day = '2026-08-16'
  assert.equal(dailySeed(day), dailySeed(day))
  assert.notEqual(dailySeed(day), dailySeed('2026-08-17'))
})

test('fragment locations change between days', () => {
  const d1 = fragmentsForDay('2026-08-16')
  const d2 = fragmentsForDay('2026-08-17')
  const d3 = fragmentsForDay('2026-08-18')
  // all three days pick from the valid objective pool (any realm)
  for (const d of [d1, d2, d3]) {
    assert.equal(d.length, 3)
    for (const id of d) assert.ok(ALL_OBJECTIVE_IDS.includes(id), `${id} is a real objective`)
  }
  // not all days are identical (realm rotation keeps routes fresh)
  const sets = new Set([d1.join(','), d2.join(','), d3.join(',')])
  assert.ok(sets.size >= 2, 'routes should differ across days')
})

test('fragments spawn at valid world positions (inside the expanded World)', () => {
  const day = dayKeyFromDate(new Date())
  for (const id of fragmentsForDay(day)) {
    const pos = fragmentLocation(id)
    assert.ok(pos, `${id} has a position`)
    assert.ok(pos!.x >= 0 && pos!.x <= 192 && pos!.z >= 0 && pos!.z <= 192)
    assert.ok(zoneOf(id).length > 0)
  }
})

test('full solo loop: dispel 3x, collect, complete', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]

  // dispel each guardian 3 times
  for (const id of route) {
    let cleared = false
    for (let i = 0; i < 3; i++) {
      const r = await post('/expedition/dispel', { playerId: PLAYER, fragmentId: id })
      assert.equal(r.status, 200)
      assert.equal(r.body.success, true)
      assert.equal(r.body.hits, i + 1)
      cleared = r.body.cleared
    }
    assert.equal(cleared, true, 'guardian clears after 3 hits')
  }

  // collect all three
  for (const id of route) {
    const r = await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })
    assert.equal(r.status, 200)
    assert.equal(r.body.success, true)
  }

  // complete
  const done = await post('/expedition/complete', { playerId: PLAYER })
  assert.equal(done.status, 200)
  assert.equal(done.body.completed, true)
  assert.equal(done.body.todayCompletions, 1)

  // state reflects completion
  const after = (await api(`/expedition?playerId=${PLAYER}`)).body
  assert.equal(after.completed, true)
  assert.equal(after.todayCompletions, 1)
  assert.ok(after.fragments.every((f: any) => f.collected))
})

test('duplicate collection is rejected', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  const id = route[0]
  for (let i = 0; i < 3; i++) {
    await post('/expedition/dispel', { playerId: PLAYER, fragmentId: id })
  }
  await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })
  const dup = await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'already_collected')
})

test('collect before guardian is cleared is rejected', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  const r = await post('/expedition/collect', { playerId: PLAYER, fragmentId: route[0] })
  assert.equal(r.status, 403)
  assert.equal(r.body.error, 'guardian_active')
})

test('invalid fragment id is rejected', async () => {
  const r = await post('/expedition/dispel', { playerId: PLAYER, fragmentId: 'hacked' })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'invalid_fragment')
})

test('fragment not in the daily route is rejected', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  // a real objective from another realm is a valid id but not in today's route
  const notInRoute = ALL_OBJECTIVE_IDS.find((id) => !route.includes(id))!
  assert.ok(notInRoute, 'found an objective outside the daily route')
  const r = await post('/expedition/dispel', { playerId: PLAYER, fragmentId: notInRoute })
  assert.equal(r.status, 404)
  assert.equal(r.body.error, 'not_in_today_mission')
})

test('completion before all fragments collected is rejected', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  const id = route[0]
  for (let i = 0; i < 3; i++) {
    await post('/expedition/dispel', { playerId: PLAYER, fragmentId: id })
  }
  await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })
  const r = await post('/expedition/complete', { playerId: PLAYER })
  assert.equal(r.status, 403)
  assert.equal(r.body.error, 'not_all_fragments_collected')
})

test('duplicate completion is rejected', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  for (const id of route) {
    for (let i = 0; i < 3; i++) {
      await post('/expedition/dispel', { playerId: PLAYER, fragmentId: id })
    }
    await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })
  }
  await post('/expedition/complete', { playerId: PLAYER })
  const dup = await post('/expedition/complete', { playerId: PLAYER })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'already_completed')
})

test('client cannot self-report completion via extra fields', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  const r = await post('/expedition/dispel', {
    playerId: PLAYER,
    fragmentId: route[0],
    completed: true,
    fragments: 99
  })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'unexpected fields are not allowed')
})

test('invalid player id is rejected', async () => {
  const r = await api('/expedition?playerId=not-an-address')
  assert.equal(r.status, 400)
})

test('two players have independent progress', async () => {
  const a = player(1)
  const b = player(2)
  const route = (await api(`/expedition?playerId=${a}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]

  // player A completes everything
  for (const id of route) {
    for (let i = 0; i < 3; i++) {
      await post('/expedition/dispel', { playerId: a, fragmentId: id })
    }
    await post('/expedition/collect', { playerId: a, fragmentId: id })
  }
  await post('/expedition/complete', { playerId: a })

  // player B is untouched: still 0 hits, 0 collected, sees todayCompletions=1
  const bState = (await api(`/expedition?playerId=${b}`)).body
  assert.equal(bState.completed, false)
  assert.ok(bState.fragments.every((f: any) => f.hits === 0 && !f.collected))
  assert.equal(bState.todayCompletions, 1, 'social proof visible to others')
})

test('reload halfway through mission preserves progress', async () => {
  const route = (await api(`/expedition?playerId=${PLAYER}`)).body.fragments.map((f: any) => f.id) as ExpeditionFragmentId[]
  const id = route[0]
  for (let i = 0; i < 3; i++) {
    await post('/expedition/dispel', { playerId: PLAYER, fragmentId: id })
  }
  await post('/expedition/collect', { playerId: PLAYER, fragmentId: id })

  // fresh GET (simulated reload) still shows 1 collected, guardian cleared
  const state = (await api(`/expedition?playerId=${PLAYER}`)).body
  const slot = state.fragments.findIndex((f: any) => f.id === id)
  assert.equal(state.fragments[slot].collected, true)
  assert.equal(state.fragments[slot].hits, 3)
  assert.equal(state.completed, false)
})

test('db failure returns internal_error without leaking details', async () => {
  const badPool = createPool('postgres://nobody:***@127.0.0.1:59999/nope')
  const badApp = createApp(badPool)
  const badServer = badApp.listen(0)
  await new Promise((resolve) => badServer.once('listening', resolve))
  const badBase = `http://127.0.0.1:${(badServer.address() as AddressInfo).port}`

  const res = await fetch(`${badBase}/expedition?playerId=${PLAYER}`)
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: 'internal_error' })

  await new Promise((resolve) => badServer.close(resolve))
  await badPool.end()
})

test('expedition validator rejects malformed payloads', async () => {
  const { expeditionFromServer } = await import('../../shared/expedition.js')
  const bad = [
    null,
    {},
    { day: 'today', seed: 1, fragments: [], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 'x', fragments: [], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 1, fragments: [{}], completed: false, todayCompletions: 0 },
    { day: '2026-08-16', seed: 1, fragments: [], completed: false, todayCompletions: -1 },
    { day: '2026-08-16', seed: 1, fragments: [], completed: 'yes', todayCompletions: 0 }
  ]
  for (const b of bad) assert.throws(() => expeditionFromServer(b))
})

test('expedition validator accepts a valid payload', async () => {
  const { expeditionFromServer } = await import('../../shared/expedition.js')
  const realm = realmForExpeditionDay('2026-08-16')
  const [a, b, c] = realm.objectives
  const ok = expeditionFromServer({
    day: '2026-08-16',
    seed: 123,
    realm: { id: realm.id, name: realm.name },
    fragments: [
      { id: a.id, location: objectiveWorld(a.id), hits: 3, collected: true },
      { id: b.id, location: objectiveWorld(b.id), hits: 0, collected: false },
      { id: c.id, location: objectiveWorld(c.id), hits: 1, collected: false }
    ],
    completed: false,
    todayCompletions: 4
  })
  assert.equal(ok.fragments.length, 3)
  assert.equal(ok.fragments[0].zone, realm.name)
  assert.equal(ok.realm.id, realm.id)
  assert.equal(ok.todayCompletions, 4)
})
