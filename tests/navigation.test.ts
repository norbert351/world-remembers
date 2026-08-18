// Tests for the Phase I navigation + guardian game-feel additions.
// Pure / engine-free: exercises describeNextTarget (distance+direction data
// the UI shows) and guardianStageFor (hit-count escalation) without an engine.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { describeNextTarget } from '../src/navigation'
import { applyExpedition, resetExpedition } from '../src/expedition'
import {
  dailySeed,
  dayKeyFromDate,
  expeditionFromServer,
  fragmentLocation,
  fragmentsForDay,
  realmForExpeditionDay
} from '../shared/expedition'
import { guardianStageFor } from '../src/fragments'

function payload(day: string, map: (id: string, i: number) => { hits: number; collected: boolean }, completed = false) {
  const realm = realmForExpeditionDay(day)
  const route = fragmentsForDay(day)
  return expeditionFromServer({
    day,
    seed: dailySeed(day),
    realm: { id: realm.id, name: realm.name },
    fragments: route.map((id, i) => ({
      id,
      location: fragmentLocation(id) ?? { x: 0, z: 0 },
      hits: map(id, i).hits,
      collected: map(id, i).collected
    })),
    completed,
    todayCompletions: 0
  })
}

afterEach(resetExpedition)

test('navigation points at the first uncollected fragment with distance', () => {
  const day = dayKeyFromDate(new Date())
  const realm = realmForExpeditionDay(day)
  const route = fragmentsForDay(day)
  applyExpedition(payload(day, () => ({ hits: 0, collected: false })))
  const player = { x: 8, z: 8 }
  const t = describeNextTarget(player)
  assert.equal(t.hasTarget, true)
  assert.equal(t.kind, 'fragment')
  assert.equal(t.name, realm.name)
  const pos = fragmentLocation(route[0])!
  assert.equal(t.distance, Math.round(Math.hypot(player.x - pos.x, player.z - pos.z)))
})

test('navigation points at the shrine when all fragments are collected', () => {
  const day = dayKeyFromDate(new Date())
  const realm = realmForExpeditionDay(day)
  applyExpedition(payload(day, () => ({ hits: 3, collected: true })))
  const t = describeNextTarget({ x: 8, z: 8 })
  assert.equal(t.hasTarget, true)
  assert.equal(t.kind, 'shrine')
})

test('navigation has no target when the expedition is completed', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(payload(day, () => ({ hits: 3, collected: true }), true))
  assert.equal(describeNextTarget({ x: 8, z: 8 }).hasTarget, false)
})

test('navigation has no target without an expedition', () => {
  assert.equal(describeNextTarget({ x: 8, z: 8 }).hasTarget, false)
})

test('guardian escalates monotonically with hits (game feel)', () => {
  const e0 = guardianStageFor(0)
  const e1 = guardianStageFor(1)
  const e2 = guardianStageFor(2)
  const e3 = guardianStageFor(3)
  assert.ok(e1.i > e0.i, 'hit 1 brighter than calm')
  assert.ok(e2.i > e1.i, 'hit 2 hotter than hit 1')
  assert.ok(e3.i > e2.i, 'defeated brightest')
  assert.notEqual(e0.c, e2.c, 'color shifts with instability')
  // hit count clamps (server caps at 3)
  assert.deepEqual(guardianStageFor(99), e3)
})
