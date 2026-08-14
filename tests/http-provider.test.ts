// Phase C tests: HTTP provider, contribution flow, in-flight guard,
// no-optimistic-mutation, graceful failure.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpWorldStateProvider, parseContribute, parseWorldState } from '../src/http-provider'
import {
  applyWorldState,
  contributionState,
  contributeToWorld,
  loadWorldState,
  setIdentityResolver,
  setStateListener,
  worldState
} from '../src/state'
import type { WorldStateProvider } from '../src/state'
import { stageFor } from '../shared/world-state'

const PLAYER = '0x' + '1'.repeat(40)

// --- controllable stub API -------------------------------------------------
let worldResponse: unknown = { contributions: 0, stage: 'DORMANT' }
let contributeResponse: unknown = { success: true, contributions: 1, stage: 'DORMANT' }
let contributeStatus = 200
let contributedBodies: unknown[] = []
let server: Server
let base = ''

before(async () => {
  server = (await import('node:http')).createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.method === 'GET' && req.url === '/world') {
      res.end(JSON.stringify(worldResponse))
      return
    }
    if (req.method === 'POST' && req.url === '/contribute') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        contributedBodies.push(JSON.parse(body))
        res.statusCode = contributeStatus
        res.end(JSON.stringify(contributeResponse))
      })
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  server.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => {
  worldResponse = { contributions: 0, stage: 'DORMANT' }
  contributeResponse = { success: true, contributions: 1, stage: 'DORMANT' }
  contributeStatus = 200
  contributedBodies = []
  // reset scene state
  worldState.contributions = 0
  worldState.version = 0
  worldState.lastContributionAt = 0
  worldState.loadError = false
  worldState.provider = new HttpWorldStateProvider(base)
  contributionState.inFlight = false
  contributionState.status = 'idle'
  contributionState.lastErrorAt = 0
  setIdentityResolver(() => PLAYER)
  setStateListener(() => {})
})

after(async () => {
  await new Promise((r) => server.close(r))
})

// --- provider --------------------------------------------------------------

test('provider load returns the server count', async () => {
  worldResponse = { contributions: 123, stage: 'AWAKENED' }
  const provider = new HttpWorldStateProvider(base)
  assert.equal(await provider.load(), 123)
})

test('provider contribute posts the player id and returns the new count', async () => {
  contributeResponse = { success: true, contributions: 124, stage: 'AWAKENED' }
  const provider = new HttpWorldStateProvider(base)
  assert.equal(await provider.contribute(PLAYER), 124)
  assert.deepEqual(contributedBodies, [{ playerId: PLAYER }])
})

test('provider load throws on server error', async () => {
  const dead = new HttpWorldStateProvider('http://127.0.0.1:59999')
  await assert.rejects(() => dead.load())
})

test('provider contribute throws on server error', async () => {
  contributeStatus = 500
  const provider = new HttpWorldStateProvider(base)
  await assert.rejects(() => provider.contribute(PLAYER))
})

test('provider contribute throws when server rejects', async () => {
  contributeResponse = { success: false, error: 'playerId must be a valid 0x Ethereum address' }
  const provider = new HttpWorldStateProvider(base)
  await assert.rejects(() => provider.contribute('nope'))
})

// --- parsing ---------------------------------------------------------------

test('parseWorldState accepts valid responses', () => {
  assert.equal(parseWorldState({ contributions: 0, stage: 'DORMANT' }), 0)
  assert.equal(parseWorldState({ contributions: 500, stage: 'FLOURISHING' }), 500)
})

test('parseWorldState rejects malformed responses', () => {
  for (const bad of [null, undefined, [], 'x', {}, { contributions: '5' }, { contributions: -1 }, { contributions: 1.5 }, { stage: 'DORMANT' }]) {
    assert.throws(() => parseWorldState(bad), undefined, JSON.stringify(bad))
  }
})

test('parseContribute rejects malformed responses', () => {
  for (const bad of [null, {}, { success: false }, { success: true }, { success: true, contributions: '1' }, { success: true, contributions: -2 }]) {
    assert.throws(() => parseContribute(bad), undefined, JSON.stringify(bad))
  }
})

// --- contribution flow -----------------------------------------------------

test('contribute success applies the returned server state', async () => {
  contributeResponse = { success: true, contributions: 124, stage: 'AWAKENED' }
  const applied: number[] = []
  setStateListener((c) => applied.push(c))
  const ok = await contributeToWorld()
  assert.equal(ok, true)
  assert.equal(worldState.contributions, 124)
  assert.equal(stageFor(worldState.contributions), 'AWAKENED')
  assert.equal(worldState.lastContributionAt > 0, true)
  assert.deepEqual(applied, [124])
  assert.equal(contributionState.status, 'success')
  assert.equal(contributionState.inFlight, false)
})

test('contribute failure does not mutate world state (no optimistic update)', async () => {
  contributeStatus = 500
  worldState.contributions = 99
  const before = worldState.lastContributionAt
  const ok = await contributeToWorld()
  assert.equal(ok, false)
  assert.equal(worldState.contributions, 99, 'count must stay untouched')
  assert.equal(worldState.lastContributionAt, before, 'success timestamp must not be set')
  assert.equal(contributionState.status, 'error')
  assert.equal(contributionState.lastErrorAt > 0, true)
})

test('failed identity fails gracefully without mutation', async () => {
  setIdentityResolver(() => null)
  worldState.contributions = 5
  const ok = await contributeToWorld()
  assert.equal(ok, false)
  assert.equal(worldState.contributions, 5)
  assert.equal(contributionState.status, 'error')
})

test('in-flight guard ignores duplicate taps', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const slowProvider: WorldStateProvider = {
    async load() {
      return 0
    },
    async contribute(_id) {
      calls++
      await gate
      return calls
    }
  }
  worldState.provider = slowProvider
  const first = contributeToWorld()
  const second = contributeToWorld()
  const third = contributeToWorld()
  release()
  const results = await Promise.all([first, second, third])
  assert.deepEqual(results, [true, false, false])
  assert.equal(calls, 1, 'only one request reaches the provider')
  assert.equal(worldState.contributions, 1)
})

test('loadWorldState applies server state and reports success', async () => {
  worldResponse = { contributions: 42, stage: 'DORMANT' }
  const ok = await loadWorldState()
  assert.equal(ok, true)
  assert.equal(worldState.contributions, 42)
  assert.equal(worldState.loadError, false)
})

test('loadWorldState failure is graceful and keeps the scene playable', async () => {
  worldState.provider = new HttpWorldStateProvider('http://127.0.0.1:59999')
  worldState.contributions = 0
  const ok = await loadWorldState()
  assert.equal(ok, false)
  assert.equal(worldState.loadError, true)
  assert.equal(worldState.contributions, 0)
  // still able to fail cleanly on contribute rather than crash
  const contributed = await contributeToWorld()
  assert.equal(contributed, false)
})

test('applyWorldState is the single path: listener fires exactly once', async () => {
  let fired = 0
  setStateListener(() => fired++)
  applyWorldState(7)
  assert.equal(worldState.contributions, 7)
  assert.equal(fired, 1)
})
