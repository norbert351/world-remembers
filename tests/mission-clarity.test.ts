// Tests for the Phase J+K mission-clarity descriptor: contextual mission
// card phases (WHAT -> WHERE -> HOW FAR -> WHAT TO DO), guardian hit
// messaging, and the approach (closer/away) direction helper.
// Pure / engine-free: imports only mission-clarity + its engine-free deps.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { describeMissionCard, guardianHitMessage, NEAR_RADIUS } from '../src/mission-clarity'
import { applyExpedition, resetExpedition } from '../src/expedition'
import { resetNavDirection, approachFor } from '../src/navigation'
import {
  dailySeed,
  dayKeyFromDate,
  expeditionFromServer,
  fragmentLocation,
  fragmentsForDay,
  realmForExpeditionDay
} from '../shared/expedition'

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

afterEach(() => {
  resetExpedition()
  resetNavDirection()
})

test('guardian hit messaging transitions through the encounter', () => {
  assert.equal(guardianHitMessage(0), 'TAP THE GUARDIAN TO DISPEL')
  assert.equal(guardianHitMessage(1), 'GUARDIAN WEAKENED · 2 MORE')
  assert.equal(guardianHitMessage(2), 'ALMOST FREE · 1 MORE')
  assert.equal(guardianHitMessage(3), 'MEMORY FREED ✨')
  assert.equal(guardianHitMessage(99), 'MEMORY FREED ✨')
})

test('approachFor reports closer when distance shrinks, away when it grows', () => {
  // first sample: no previous -> steady
  assert.equal(approachFor(null, 40), 'steady')
  // 40 -> 20: clearly closer
  assert.equal(approachFor(40, 20), 'closer')
  // 20 -> 45: clearly away
  assert.equal(approachFor(20, 45), 'away')
  // small change within threshold -> steady (no flicker)
  assert.equal(approachFor(20, 19), 'steady')
})

test('card is enter phase before the player starts and far from target', () => {
  const day = dayKeyFromDate(new Date())
  const realm = realmForExpeditionDay(day)
  applyExpedition(payload(day, () => ({ hits: 0, collected: false })))
  const first = fragmentLocation(fragmentsForDay(day)[0])!
  // a position far outside NEAR_RADIUS
  const player = { x: first.x - 100, z: first.z }
  const card = describeMissionCard(player, false)
  assert.equal(card.phase, 'enter')
  assert.equal(card.title, "TODAY'S MEMORY")
  assert.equal(card.progress, '0 / 3')
  assert.equal(card.action, 'ENTER THE REALM')
  assert.equal(card.nextWhere, realm.name.replace(/^The /, ''))
})

test('card is searching once started, with distance, while far from the target', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(payload(day, () => ({ hits: 0, collected: false })))
  const first = fragmentLocation(fragmentsForDay(day)[0])!
  const player = { x: first.x - 80, z: first.z }
  const card = describeMissionCard(player, true)
  assert.equal(card.phase, 'searching')
  assert.equal(card.action, 'FOLLOW THE GOLD TRAIL →')
  assert.equal(card.howFar, 80)
  assert.equal(card.distanceLabel, '80m')
  assert.equal(card.nextWhere, card.nextWhere.toUpperCase())
})

test('card is guardian phase when next objective is near and guarded', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(payload(day, () => ({ hits: 0, collected: false })))
  const first = fragmentLocation(fragmentsForDay(day)[0])!
  const player = { x: first.x + 2, z: first.z }
  const card = describeMissionCard(player, true)
  assert.equal(card.phase, 'guardian')
  assert.equal(card.title, 'CORRUPTED MEMORY FOUND')
  assert.equal(card.action, 'TAP THE GUARDIAN TO DISPEL')
})

test('card is near phase at an objective whose guardian is cleared, before collect', () => {
  const day = dayKeyFromDate(new Date())
  // first fragment guardian cleared (hits 3, not collected yet)
  applyExpedition(payload(day, (_, i) => ({ hits: i === 0 ? 3 : 0, collected: i !== 0 })))
  const first = fragmentLocation(fragmentsForDay(day)[0])!
  const player = { x: first.x + 1, z: first.z }
  const card = describeMissionCard(player, true)
  assert.equal(card.phase, 'near')
  assert.equal(card.action, 'LOOK FOR THE MEMORY BEACON')
})

test('card counts progress after a collection (1 / 3)', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(
    payload(day, (_, i) => ({
      hits: i === 0 ? 3 : 0,
      collected: i === 0
    }))
  )
  const card = describeMissionCard({ x: 0, z: 0 }, true)
  assert.equal(card.progress, '1 / 3')
})

test('card is return phase when all 3 memories are collected', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(payload(day, () => ({ hits: 3, collected: true })))
  const card = describeMissionCard({ x: 0, z: 0 }, true)
  assert.equal(card.phase, 'return')
  assert.equal(card.title, 'ALL MEMORIES FOUND ✨')
  assert.equal(card.objective, 'Return to the Memory Tree')
  assert.equal(card.action, "RESTORE TODAY\u2019S MEMORY")
  assert.equal(card.nextWhere, 'THE MEMORY TREE')
  // all collected -> destination is the shrine, so a live distance is shown
  assert.equal(typeof card.howFar, 'number')
})

test('card is restored phase when the expedition is complete', () => {
  const day = dayKeyFromDate(new Date())
  applyExpedition(payload(day, () => ({ hits: 3, collected: true }), true))
  const card = describeMissionCard({ x: 0, z: 0 }, true)
  assert.equal(card.phase, 'restored')
  assert.equal(card.title, 'MEMORY RESTORED')
})

test('card has no phase-local state before the expedition loads', () => {
  const card = describeMissionCard({ x: 0, z: 0 }, true)
  assert.equal(card.phase, 'loading')
})
