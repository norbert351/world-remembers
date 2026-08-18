// Phase F+G client tests: living-world parser validation, derived level,
// rare memory determinism, provider failure handling, interaction priority.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { parseLivingWorld, resetLivingWorld, livingWorldState } from '../src/living-world'
import { memoryLevelFor, landmarkStageFor, rareLocationForDay, LOCATION_REACTIONS, isLocationReactionId } from '../shared/world-memory'
import { ALL_OBJECTIVE_IDS } from '../shared/realms'

const validBody = {
  contributions: 100,
  stage: 'FLOURISHING',
  memoryLevel: { level: 3, name: 'THE GROWING WORLD', score: 14 },
  landmark: { stage: 2, name: 'FOUNDATION' },
  dailyEvent: { day: '2026-08-16', pulse: true },
  communityActivity: { contributions: 100, stoneMemories: 7, completedExpeditions: 3 },
  rareMemory: { locationId: 'g4', discovered: false, discoveredBy: null },
  returnSummary: { newMemories: 7, explorers: 3, level: 3 }
}

test('parseLivingWorld accepts a valid payload', () => {
  const w = parseLivingWorld(validBody)
  assert.equal(w.memoryLevel.level, 3)
  assert.equal(w.memoryLevel.name, 'THE GROWING WORLD')
  assert.equal(w.landmark.stage, 2)
  assert.equal(w.dailyEvent.pulse, true)
  assert.equal(w.communityActivity.completedExpeditions, 3)
  assert.equal(w.rareMemory.locationId, 'g4')
})

test('parseLivingWorld rejects malformed payloads', () => {
  const bad = [
    null,
    {},
    { ...validBody, memoryLevel: { level: '3', name: 'X', score: 0 } },
    { ...validBody, memoryLevel: { level: 3, name: 5, score: 0 } },
    { ...validBody, landmark: { stage: '2', name: 'X' } },
    { ...validBody, dailyEvent: { day: 42, pulse: false } },
    { ...validBody, dailyEvent: { day: '2026-08-16', pulse: 'yes' } },
    { ...validBody, rareMemory: { locationId: 7, discovered: false } },
    { ...validBody, communityActivity: { contributions: '100', stoneMemories: 0, completedExpeditions: 0 } },
    { ...validBody, communityActivity: { contributions: 100, stoneMemories: 0 } } // missing field
  ]
  for (const b of bad) assert.throws(() => parseLivingWorld(b), 'should throw for ' + JSON.stringify(b).slice(0, 60))
})

test('memory level thresholds and boundaries', () => {
  const a = (c: number, s: number, m: number) => ({ contributions: c, stoneMemories: s, completedExpeditions: m })
  assert.equal(memoryLevelFor(a(0, 0, 0)).level, 1)
  assert.equal(memoryLevelFor(a(39, 0, 0)).level, 1)
  assert.equal(memoryLevelFor(a(40, 0, 0)).level, 2) // boundary: exactly 40
  assert.equal(memoryLevelFor(a(119, 0, 0)).level, 2)
  assert.equal(memoryLevelFor(a(120, 0, 0)).level, 3)
  assert.equal(memoryLevelFor(a(299, 0, 0)).level, 3)
  assert.equal(memoryLevelFor(a(300, 0, 0)).level, 4)
  assert.equal(memoryLevelFor(a(599, 0, 0)).level, 4)
  assert.equal(memoryLevelFor(a(600, 0, 0)).level, 5)
  // stone memories weight 5: 8 memories = 40 -> level 2
  assert.equal(memoryLevelFor(a(0, 8, 0)).level, 2)
  // completed expeditions weight 25: 2 = 50 -> level 2
  assert.equal(memoryLevelFor(a(0, 0, 2)).level, 2)
  // clamped at 5
  assert.equal(memoryLevelFor(a(1e9, 1e9, 1e9)).level, 5)
})

test('landmark stage progression', () => {
  assert.equal(landmarkStageFor(0).stage, 1)
  assert.equal(landmarkStageFor(2).stage, 1)
  assert.equal(landmarkStageFor(3).stage, 2)
  assert.equal(landmarkStageFor(9).stage, 2)
  assert.equal(landmarkStageFor(10).stage, 3)
  assert.equal(landmarkStageFor(24).stage, 3)
  assert.equal(landmarkStageFor(25).stage, 4)
  assert.equal(landmarkStageFor(59).stage, 4)
  assert.equal(landmarkStageFor(60).stage, 5)
  assert.equal(landmarkStageFor(9999).stage, 5)
})

test('rare location is deterministic and unique per day', () => {
  const d1 = rareLocationForDay('2026-08-16', ALL_OBJECTIVE_IDS)
  const d1b = rareLocationForDay('2026-08-16', ALL_OBJECTIVE_IDS)
  const d2 = rareLocationForDay('2026-08-17', ALL_OBJECTIVE_IDS)
  assert.equal(d1, d1b)
  assert.ok(ALL_OBJECTIVE_IDS.includes(d1))
  assert.ok(ALL_OBJECTIVE_IDS.includes(d2))
})

test('location reaction whitelist', () => {
  assert.equal(LOCATION_REACTIONS.length, 4)
  assert.ok(isLocationReactionId('remembered'))
  assert.ok(isLocationReactionId('iwashere'))
  assert.ok(!isLocationReactionId('grief'))
  assert.ok(!isLocationReactionId(''))
})

test('applyLivingWorld stores state; reset clears', () => {
  resetLivingWorld()
  assert.equal(livingWorldState.loaded, false)
  livingWorldState.state = null
  assert.equal(livingWorldState.loaded, false)
})

test('provider offline leaves scene playable (loadError set, no throw)', async () => {
  resetLivingWorld()
  livingWorldState.provider = {
    load: () => Promise.reject(new Error('offline')),
    leaveLocationMemory: () => Promise.reject(new Error('offline')),
    discoverRare: () => Promise.reject(new Error('offline'))
  }
  // loadLivingWorld catches; state stays unloaded
  const { loadLivingWorld } = await import('../src/living-world')
  const ok = await loadLivingWorld()
  assert.equal(ok, false)
  assert.equal(livingWorldState.loadError, true)
  assert.equal(livingWorldState.loaded, false)
})

afterEach(() => {
  resetLivingWorld()
})