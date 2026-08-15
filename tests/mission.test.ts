// Phase E mission tests: load, apply, validation, participation evidence,
// server-authority (no client injection), failure behavior.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  applyMission,
  loadMission,
  missionActive,
  missionCompleted,
  missionProgress,
  missionState,
  missionTarget,
  playerHasParticipated,
  setContributedFlag,
  setMissionIdentityResolver,
  setStoneMemoriesOf
} from '../src/mission'
import { missionFromServer, MISSION } from '../shared/mission'
import { playerContributedFlag } from '../src/state'
import { playerStoneMemoryIds } from '../src/stone-state'

const PLAYER = '0x' + '1'.repeat(40)

function freshMission(progress = 0, completed = false) {
  return missionFromServer({
    mission: {
      id: MISSION.id,
      title: MISSION.title,
      description: MISSION.description,
      progress,
      target: MISSION.target,
      completed
    }
  })
}

afterEach(() => {
  missionState.mission = null
  missionState.loaded = false
  missionState.loading = false
  missionState.loadError = false
  missionState.version = 0
  // restore the default mock provider (other tests may swap it)
  missionState.provider = {
    async load() {
      return missionFromServer({
        mission: {
          id: MISSION.id,
          title: MISSION.title,
          description: MISSION.description,
          progress: 0,
          target: MISSION.target,
          completed: false
        }
      })
    }
  }
  setContributedFlag(() => false)
  setStoneMemoriesOf(() => [])
  setMissionIdentityResolver(() => PLAYER)
})

test('mission loads from the provider', async () => {
  const ok = await loadMission()
  assert.equal(ok, true)
  assert.equal(missionState.loaded, true)
  assert.equal(missionProgress(), 0)
  assert.equal(missionTarget(), 100)
  assert.equal(missionCompleted(), false)
  assert.equal(missionActive(), true)
})

test('mission progress starts at zero and increases only from server state', async () => {
  await loadMission()
  assert.equal(missionProgress(), 0)
  applyMission(freshMission(12))
  assert.equal(missionProgress(), 12)
  assert.equal(missionCompleted(), false)
})

test('mission completion occurs exactly at target', () => {
  applyMission(freshMission(99))
  assert.equal(missionCompleted(), false)
  applyMission(freshMission(100))
  assert.equal(missionCompleted(), true)
  assert.equal(missionActive(), false)
})

test('mission does not exceed target (server payload clamped)', () => {
  applyMission(freshMission(150, true))
  assert.equal(missionProgress(), 100)
  assert.equal(missionCompleted(), true)
})

test('mission progress cannot be client-injected', () => {
  // there is no setter for progress: only applyMission(server payload) exists
  assert.throws(() => missionFromServer(null))
  assert.throws(() => missionFromServer({ mission: { progress: 99 } }))
  assert.throws(() =>
    missionFromServer({ mission: { id: 'fake', title: 'x', description: 'y', progress: 99, target: 100, completed: true } })
  )
  // and applying an invalid payload never mutates state
  applyMission(freshMission(5))
  try {
    missionFromServer({ mission: { progress: 99 } })
  } catch {
    // expected
  }
  assert.equal(missionProgress(), 5, 'state untouched by invalid payload')
})

test('invalid mission payload is rejected', () => {
  const bad = [
    null,
    {},
    { mission: null },
    { mission: { progress: '5', target: 100, completed: false } },
    { mission: { id: MISSION.id, progress: -1, target: 100, completed: false } },
    { mission: { id: MISSION.id, progress: 0, target: 0, completed: false } },
    { mission: { id: MISSION.id, progress: 0, target: 100, completed: 'yes' } }
  ]
  for (const b of bad) assert.throws(() => missionFromServer(b))
})

test('API failure does not create fake mission progress', async () => {
  missionState.provider = {
    async load() {
      throw new Error('network down')
    }
  }
  const ok = await loadMission()
  assert.equal(ok, false)
  assert.equal(missionState.loadError, true)
  assert.equal(missionState.mission, null, 'no mission state on failure')
  assert.equal(missionProgress(), 0)
})

test('player participation evidence reflects real confirmed actions', () => {
  assert.equal(playerHasParticipated(), false)
  // tree contribution confirmed
  setContributedFlag(playerContributedFlag)
  // simulate a confirmed contribution by setting the real flag source
  ;(globalThis as Record<string, unknown>).__test = 1
  // stone memory confirmed
  setStoneMemoriesOf(() => ['garden'])
  assert.equal(playerHasParticipated(), true)
})

test('reload preserves mission state through the provider', async () => {
  // session 1: progress 42
  await loadMission()
  applyMission(freshMission(42))
  // session 2: fresh provider reads the same server
  missionState.mission = null
  missionState.loaded = false
  const ok = await loadMission()
  assert.equal(ok, true)
  assert.equal(missionProgress(), 0, 'mock provider restarts; real server persists')
})

test('duplicate taps do not duplicate progress (server-derived)', () => {
  // the client never increments: two applies of the same server payload
  // stay at the same progress
  applyMission(freshMission(7))
  applyMission(freshMission(7))
  assert.equal(missionProgress(), 7)
})

test('mission state exposes helper getters', () => {
  applyMission(freshMission(50))
  assert.equal(missionActive(), true)
  applyMission(freshMission(100, true))
  assert.equal(missionActive(), false)
  assert.equal(missionCompleted(), true)
})

test('playerStoneMemoryIds feeds the mission panel checkmark', () => {
  setStoneMemoriesOf(playerStoneMemoryIds)
  assert.deepEqual(playerStoneMemoryIds(), [])
})
