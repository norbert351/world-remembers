// Phase D stone tests: HTTP provider, stone state flow, in-flight guard,
// duplicate prevention, malformed responses, graceful failure, reload.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpStoneProvider, parseStoneDetail, parseStones, reactionInfo } from '../src/http-provider'
import {
  closeStone,
  leaveMemoryOnStone,
  loadStoneDetail,
  loadStones,
  myMemoryOn,
  selectStone,
  setStoneIdentityResolver,
  stoneState
} from '../src/stone-state'
import type { StoneProvider } from '../src/stone-state'

const PLAYER = '0x' + '1'.repeat(40)
const OTHER = '0x' + '2'.repeat(40)

// --- controllable stub API -------------------------------------------------
let stonesResponse: unknown = { stones: [] }
let stoneDetailResponse: unknown = { stone: { id: 'garden', memoryCount: 0 }, memories: [] }
let memoryStatus = 201
let memoryResponse: unknown = { success: true, stoneId: 'garden', memoryCount: 1, memories: [] }
let postedBodies: unknown[] = []
let server: Server
let base = ''

before(async () => {
  server = (await import('node:http')).createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.method === 'GET' && req.url === '/stones') {
      res.end(JSON.stringify(stonesResponse))
      return
    }
    if (req.method === 'GET' && req.url === '/stones/garden') {
      res.end(JSON.stringify(stoneDetailResponse))
      return
    }
    if (req.method === 'POST' && req.url === '/stones/garden/memories') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        postedBodies.push(JSON.parse(body))
        res.statusCode = memoryStatus
        res.end(JSON.stringify(memoryResponse))
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

function resetState(): void {
  stoneState.stones = []
  stoneState.selected = null
  stoneState.details = {}
  stoneState.loadingStones = false
  stoneState.loadingDetail = false
  stoneState.saving = false
  stoneState.status = 'idle'
  stoneState.lastSavedAt = 0
  stoneState.lastErrorAt = 0
  stoneState.loadError = false
  stoneState.version = 0
  stoneState.provider = new HttpStoneProvider(base)
  setStoneIdentityResolver(() => PLAYER)
}

beforeEach(() => {
  stonesResponse = {
    stones: [
      { id: 'garden', memoryCount: 0 },
      { id: 'ridge', memoryCount: 0 },
      { id: 'tree', memoryCount: 0 }
    ]
  }
  stoneDetailResponse = { stone: { id: 'garden', memoryCount: 0 }, memories: [] }
  memoryStatus = 201
  memoryResponse = {
    success: true,
    stoneId: 'garden',
    memoryCount: 1,
    memories: [{ playerId: PLAYER, reaction: 'found', createdAt: '2026-08-15T00:00:00.000Z' }]
  }
  postedBodies = []
  resetState()
})

after(async () => {
  await new Promise((r) => server.close(r))
})

// --- parsing ---------------------------------------------------------------

test('parseStones accepts a valid list', () => {
  const stones = parseStones({ stones: [{ id: 'garden', memoryCount: 3 }, { id: 'ridge', memoryCount: 0 }] })
  assert.equal(stones.length, 2)
  assert.equal(stones[0].memoryCount, 3)
})

test('parseStones rejects malformed responses', () => {
  const bad = [
    null,
    {},
    { stones: 'x' },
    { stones: [{ id: 'garden' }] },
    { stones: [{ id: 'garden', memoryCount: -1 }] },
    { stones: [{ id: 'garden', memoryCount: 1.5 }] },
    { stones: [{ id: 'nope', memoryCount: 1 }] }
  ]
  for (const b of bad) assert.throws(() => parseStones(b), undefined, JSON.stringify(b))
})

test('parseStoneDetail accepts a valid detail with reactions', () => {
  const d = parseStoneDetail({
    stone: { id: 'garden', memoryCount: 2 },
    memories: [
      { playerId: PLAYER, reaction: 'found', createdAt: '2026-08-15T00:00:00.000Z' },
      { playerId: OTHER, reaction: 'beautiful', createdAt: '2026-08-14T00:00:00.000Z' }
    ]
  })
  assert.equal(d.memoryCount, 2)
  assert.equal(d.memories.length, 2)
  assert.equal(d.memories[0].reaction, 'found')
})

test('parseStoneDetail rejects malformed responses', () => {
  const bad = [
    null,
    {},
    { stone: { id: 'garden', memoryCount: 1 } },
    { stone: { id: 'garden', memoryCount: 1 }, memories: 'x' },
    { stone: { id: 'nope', memoryCount: 1 }, memories: [] },
    { stone: { id: 'garden', memoryCount: 1 }, memories: [{ playerId: PLAYER }] },
    { stone: { id: 'garden', memoryCount: 1 }, memories: [{ playerId: PLAYER, reaction: 'hack', createdAt: 'x' }] }
  ]
  for (const b of bad) assert.throws(() => parseStoneDetail(b), undefined, JSON.stringify(b))
})

test('reactionInfo resolves whitelisted ids and falls back safely', () => {
  assert.equal(reactionInfo('found').emoji, '🌱')
  assert.equal(reactionInfo('return').label, "I'll come back.")
  assert.equal(reactionInfo('nope' as never).emoji, '·')
})

// --- provider --------------------------------------------------------------

test('listStones returns the server list', async () => {
  const provider = new HttpStoneProvider(base)
  const stones = await provider.listStones()
  assert.equal(stones.length, 3)
  assert.equal(stones[0].id, 'garden')
})

test('listStones throws on server error', async () => {
  const dead = new HttpStoneProvider('http://127.0.0.1:59999')
  await assert.rejects(() => dead.listStones())
})

test('loadStone returns the detail', async () => {
  const provider = new HttpStoneProvider(base)
  const detail = await provider.loadStone('garden')
  assert.equal(detail.id, 'garden')
})

test('leaveMemory posts the player id and reaction', async () => {
  const provider = new HttpStoneProvider(base)
  const detail = await provider.leaveMemory('garden', PLAYER, 'found')
  assert.equal(detail.memoryCount, 1)
  assert.deepEqual(postedBodies, [{ playerId: PLAYER, reaction: 'found' }])
})

test('leaveMemory maps a 409 to already_left_memory', async () => {
  memoryStatus = 409
  memoryResponse = { success: false, error: 'already_left_memory', memory: { playerId: PLAYER, reaction: 'found' } }
  const provider = new HttpStoneProvider(base)
  await assert.rejects(() => provider.leaveMemory('garden', PLAYER, 'beautiful'), /already_left_memory/)
})

// --- state flow ------------------------------------------------------------

test('loadStones fills the stone list', async () => {
  const ok = await loadStones()
  assert.equal(ok, true)
  assert.equal(stoneState.stones.length, 3)
  assert.equal(stoneState.loadError, false)
})

test('loadStones failure is graceful', async () => {
  stoneState.provider = new HttpStoneProvider('http://127.0.0.1:59999')
  const ok = await loadStones()
  assert.equal(ok, false)
  assert.equal(stoneState.loadError, true)
  assert.equal(stoneState.stones.length, 0)
})

test('selectStone opens the UI and loads the detail', async () => {
  selectStone('garden')
  assert.equal(stoneState.selected, 'garden')
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(stoneState.details['garden'], 'detail fetched into cache')
  assert.equal(stoneState.details['garden'].id, 'garden')
})

test('closeStone clears the selection', () => {
  selectStone('garden')
  closeStone()
  assert.equal(stoneState.selected, null)
})

test('loadStoneDetail caches and dedupes', async () => {
  const first = await loadStoneDetail('garden')
  const second = await loadStoneDetail('garden')
  assert.ok(first && second)
  assert.equal(first, second, 'same cached object, no second fetch')
})

test('successful memory applies server state and marks my memory', async () => {
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  const ok = await leaveMemoryOnStone('found')
  assert.equal(ok, true)
  assert.equal(stoneState.status, 'success')
  assert.ok(stoneState.lastSavedAt > 0, 'success toast timestamp set')
  assert.equal(stoneState.details['garden'].memoryCount, 1)
  assert.equal(myMemoryOn('garden')?.reaction, 'found')
  assert.equal(stoneState.saving, false)
})

test('failed memory does not mutate state and sets error', async () => {
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  memoryStatus = 500
  memoryResponse = { success: false, error: 'internal_error' }
  const ok = await leaveMemoryOnStone('found')
  assert.equal(ok, false)
  assert.equal(stoneState.status, 'error')
  assert.ok(stoneState.lastErrorAt > 0)
  assert.equal(myMemoryOn('garden'), null, 'no optimistic memory')
  assert.equal(stoneState.lastSavedAt, 0, 'no success toast on failure')
})

test('already-left is prevented client-side once confirmed', async () => {
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  await leaveMemoryOnStone('found')
  const callsBefore = postedBodies.length
  const second = await leaveMemoryOnStone('beautiful')
  assert.equal(second, false, 'second leave is refused locally')
  assert.equal(postedBodies.length, callsBefore, 'no second request reaches the server')
})

test('server 409 duplicate reloads the stored memory', async () => {
  // simulate the player having left a memory before this session
  stoneDetailResponse = {
    stone: { id: 'garden', memoryCount: 1 },
    memories: [{ playerId: PLAYER, reaction: 'return', createdAt: '2026-08-10T00:00:00.000Z' }]
  }
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(myMemoryOn('garden')?.reaction, 'return')
  // a stale tap that somehow reaches the server gets 409, not a duplicate
  memoryStatus = 409
  memoryResponse = { success: false, error: 'already_left_memory' }
  const ok = await leaveMemoryOnStone('found')
  assert.equal(ok, false)
  assert.equal(stoneState.details['garden'].memoryCount, 1, 'no duplicate row counted')
})

test('in-flight guard ignores rapid duplicate taps', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const slowProvider: StoneProvider = {
    async listStones() {
      return []
    },
    async loadStone(id) {
      return { id, memoryCount: 0, memories: [] }
    },
    async leaveMemory(id, _p, reaction) {
      calls++
      await gate
      return { id, memoryCount: 1, memories: [{ playerId: PLAYER, reaction, createdAt: new Date().toISOString() }] }
    }
  }
  stoneState.provider = slowProvider
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  const first = leaveMemoryOnStone('found')
  const second = leaveMemoryOnStone('beautiful')
  release()
  const results = await Promise.all([first, second])
  assert.deepEqual(results, [true, false])
  assert.equal(calls, 1, 'only one request reaches the provider')
})

test('successful reload keeps the memory after a fresh scene load', async () => {
  // session 1: player leaves a memory
  selectStone('garden')
  await new Promise((r) => setTimeout(r, 30))
  await leaveMemoryOnStone('found')
  assert.equal(myMemoryOn('garden')?.reaction, 'found')

  // session 2: a brand new provider (fresh scene) reads the same stone
  stonesResponse = {
    stones: [
      { id: 'garden', memoryCount: 1 },
      { id: 'ridge', memoryCount: 0 },
      { id: 'tree', memoryCount: 0 }
    ]
  }
  stoneDetailResponse = {
    stone: { id: 'garden', memoryCount: 1 },
    memories: [{ playerId: PLAYER, reaction: 'found', createdAt: '2026-08-15T00:00:00.000Z' }]
  }
  resetState()
  const ok = await loadStones()
  assert.equal(ok, true)
  assert.equal(stoneState.stones.find((s) => s.id === 'garden')?.memoryCount, 1)
  await loadStoneDetail('garden')
  assert.equal(myMemoryOn('garden')?.reaction, 'found', 'memory survives the reload')
})
