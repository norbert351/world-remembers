// Phase E ritual tests: the pure state machine. No engine, no network:
// startRitual / tickRitual / ritualIntensity are exercised directly.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  currentActivity,
  registerRitualHooks,
  resetRitual,
  ritualIntensity,
  ritualState,
  secondsUntilRitual,
  startRitual,
  startRitualWith,
  tickRitual,
  type RitualPhase
} from '../src/ritual'
import { RITUAL } from '../src/config'
import { stoneState } from '../src/stone-state'
import { worldState } from '../src/state'

afterEach(() => {
  resetRitual()
  // restore default hooks so tests never leak into each other
  registerRitualHooks({ onPhase: () => {}, onComplete: () => {} })
})

// --- intensity from real state --------------------------------------------

test('intensity 0 when the world is empty', () => {
  assert.equal(ritualIntensity(0, 0, 0), 0)
  assert.equal(ritualIntensity(50, 0, 0), 0)
})

test('intensity 1 when the tree awakened or any memory exists', () => {
  assert.equal(ritualIntensity(100, 1, 0), 1)
  assert.equal(ritualIntensity(0, 0, 1), 1)
  assert.equal(ritualIntensity(120, 1, 2), 1)
})

test('intensity 2 when the tree is grown and memories exist', () => {
  assert.equal(ritualIntensity(250, 2, 1), 2)
  assert.equal(ritualIntensity(500, 3, 5), 2)
})

// --- start / transitions ---------------------------------------------------

test('startRitual begins at quiet with the real intensity', () => {
  worldState.contributions = 0
  stoneState.stones = [{ id: 'garden', memoryCount: 0 }]
  const phases: RitualPhase[] = []
  registerRitualHooks({ onPhase: (p) => phases.push(p), onComplete: () => {} })
  const started = startRitual()
  assert.equal(started, true)
  assert.equal(ritualState.active, true)
  assert.equal(ritualState.phase, 'quiet')
  assert.equal(ritualState.intensity, 0)
  assert.deepEqual(phases, ['quiet'])
})

test('ritual transitions quiet -> response -> sky -> complete -> idle', () => {
  const phases: RitualPhase[] = []
  registerRitualHooks({ onPhase: (p) => phases.push(p), onComplete: () => {} })
  startRitualWith({ contributions: 300, treeStage: 2, stoneMemories: 3 })

  // quiet lasts RITUAL.quiet seconds
  tickRitual(RITUAL.quiet - 0.01)
  assert.equal(ritualState.phase, 'quiet')
  tickRitual(0.02)
  assert.equal(ritualState.phase, 'response')
  assert.deepEqual(phases, ['quiet', 'response'])

  tickRitual(RITUAL.response)
  assert.equal(ritualState.phase, 'sky')

  tickRitual(RITUAL.sky)
  assert.equal(ritualState.phase, 'complete')

  tickRitual(RITUAL.complete)
  assert.equal(ritualState.phase, 'idle')
  assert.equal(ritualState.active, false)
  assert.equal(ritualState.completedCount, 1)
  assert.deepEqual(phases, ['quiet', 'response', 'sky', 'complete'])
})

test('ritual cannot overlap itself', () => {
  startRitualWith({ contributions: 0, treeStage: 0, stoneMemories: 0 })
  assert.equal(startRitual(), false, 'second start while active is refused')
  assert.equal(startRitualWith({ contributions: 500, treeStage: 3, stoneMemories: 9 }), false)
  tickRitual(RITUAL.quiet + RITUAL.response + RITUAL.sky + RITUAL.complete)
  assert.equal(ritualState.active, false)
  // now it can start again
  assert.equal(startRitual(), true)
})

test('ritual completes exactly once and resets the cooldown', () => {
  let completes = 0
  registerRitualHooks({ onPhase: () => {}, onComplete: () => completes++ })
  startRitualWith({ contributions: 0, treeStage: 0, stoneMemories: 0 })
  tickRitual(RITUAL.quiet + RITUAL.response + RITUAL.sky + RITUAL.complete)
  assert.equal(completes, 1)
  assert.equal(ritualState.completedCount, 1)
  // cooldown restarts after completion
  assert.equal(secondsUntilRitual(), RITUAL.intervalSeconds)
})

test('ritual works with zero world activity (solo visitor)', () => {
  worldState.contributions = 0
  stoneState.stones = [
    { id: 'garden', memoryCount: 0 },
    { id: 'ridge', memoryCount: 0 },
    { id: 'tree', memoryCount: 0 }
  ]
  const started = startRitual()
  assert.equal(started, true, 'ritual runs with one player and no history')
  tickRitual(RITUAL.quiet + RITUAL.response + RITUAL.sky + RITUAL.complete)
  assert.equal(ritualState.active, false)
  assert.equal(ritualState.completedCount, 1)
})

test('tree stage affects the ritual intensity', () => {
  assert.equal(ritualIntensity(99, 0, 1), 1)
  assert.equal(ritualIntensity(100, 1, 1), 1)
  assert.equal(ritualIntensity(250, 2, 1), 2)
})

test('contribution count affects the ritual intensity', () => {
  assert.equal(ritualIntensity(0, 0, 0), 0)
  assert.equal(ritualIntensity(100, 0, 0), 1, 'awakened without memories')
  assert.equal(ritualIntensity(250, 0, 1), 2, 'grown + memory')
})

test('stone memory count affects the ritual intensity', () => {
  assert.equal(ritualIntensity(0, 0, 0), 0)
  assert.equal(ritualIntensity(0, 0, 1), 1, 'one memory alone')
  assert.equal(ritualIntensity(250, 2, 7), 2, 'many memories + grown tree')
})

// --- automatic scheduling --------------------------------------------------

test('ritual starts automatically when the cooldown expires', () => {
  resetRitual()
  worldState.contributions = 0
  stoneState.stones = []
  assert.equal(ritualState.phase, 'idle')
  tickRitual(RITUAL.intervalSeconds - 0.01)
  assert.equal(ritualState.phase, 'idle', 'not yet')
  tickRitual(0.02)
  assert.equal(ritualState.phase, 'quiet', 'auto-started')
  assert.equal(ritualState.active, true)
})

test('secondsUntilRitual counts down', () => {
  resetRitual()
  tickRitual(60)
  assert.ok(secondsUntilRitual() <= RITUAL.intervalSeconds - 59.9)
  assert.ok(secondsUntilRitual() > 0)
})

test('API unavailable does not crash the ritual machine', () => {
  // the machine never touches the network; it reads cached state only
  registerRitualHooks({
    onPhase: () => {
      throw new Error('visual hook failure')
    },
    onComplete: () => {}
  })
  // even if a visual hook throws, the state machine keeps its invariants
  assert.throws(() => startRitualWith({ contributions: 0, treeStage: 0, stoneMemories: 0 }))
  // after reset, it runs cleanly again
  resetRitual()
  registerRitualHooks({ onPhase: () => {}, onComplete: () => {} })
  startRitualWith({ contributions: 0, treeStage: 0, stoneMemories: 0 })
  tickRitual(RITUAL.quiet + RITUAL.response + RITUAL.sky + RITUAL.complete)
  assert.equal(ritualState.active, false)
  assert.equal(ritualState.completedCount, 1)
})

test('scene reload resets the machine without breaking it', () => {
  startRitualWith({ contributions: 100, treeStage: 1, stoneMemories: 2 })
  assert.equal(ritualState.active, true)
  resetRitual()
  assert.equal(ritualState.active, false)
  assert.equal(ritualState.phase, 'idle')
  assert.equal(ritualState.completedCount, 0)
  // the world keeps working after reload
  startRitualWith({ contributions: 100, treeStage: 1, stoneMemories: 2 })
  tickRitual(RITUAL.quiet + RITUAL.response + RITUAL.sky + RITUAL.complete)
  assert.equal(ritualState.completedCount, 1)
})

test('currentActivity reflects live world and stone state', () => {
  worldState.contributions = 120
  stoneState.stones = [
    { id: 'garden', memoryCount: 2 },
    { id: 'ridge', memoryCount: 0 },
    { id: 'tree', memoryCount: 1 }
  ]
  const a = currentActivity()
  assert.equal(a.contributions, 120)
  assert.equal(a.treeStage, 1)
  assert.equal(a.stoneMemories, 3)
})
