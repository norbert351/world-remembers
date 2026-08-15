// Integration tests for the Memory Stones API.
// Uses the same dedicated test database (world_remembers_test) as
// api.test.ts. Run with: npm test  (backend/.env must exist)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import { createPool } from '../src/db'
import type { Pool } from 'pg'

const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')

const PLAYER_A = '0x' + 'a'.repeat(40)
const PLAYER_B = '0x' + 'b'.repeat(40)

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

before(async () => {
  pool = createPool(testUrl)
  for (const file of ['001_contributions.sql', '002_memory_stones.sql']) {
    const sql = readFileSync(join(__dirname, '..', 'migrations', file), 'utf8')
    await pool.query(sql)
  }
  const app = createApp(pool)
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await pool.query('TRUNCATE stone_memories')
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('GET /stones lists all three stones with zero memories', async () => {
  const { status, body } = await api('/stones')
  assert.equal(status, 200)
  assert.deepEqual(body, {
    stones: [
      { id: 'garden', memoryCount: 0 },
      { id: 'ridge', memoryCount: 0 },
      { id: 'tree', memoryCount: 0 }
    ]
  })
})

test('GET /stones/:id returns the stone with an empty history', async () => {
  const { status, body } = await api('/stones/garden')
  assert.equal(status, 200)
  assert.deepEqual(body.stone, { id: 'garden', memoryCount: 0 })
  assert.deepEqual(body.memories, [])
})

test('GET /stones/:id rejects an unknown stone', async () => {
  for (const id of ['nope', 'GARDEN', 'garden;drop']) {
    const { status, body } = await api(`/stones/${encodeURIComponent(id)}`)
    assert.equal(status, 404, `expected 404 for ${id}`)
    assert.equal(body.error, 'unknown_stone')
  }
})

test('POST valid memory creates it and returns the updated history', async () => {
  const { status, body } = await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  assert.equal(status, 201)
  assert.equal(body.success, true)
  assert.equal(body.stoneId, 'garden')
  assert.equal(body.memoryCount, 1)
  assert.equal(body.memories.length, 1)
  assert.equal(body.memories[0].playerId, PLAYER_A)
  assert.equal(body.memories[0].reaction, 'found')

  const { rows } = await pool.query('SELECT stone_id, player_id, reaction FROM stone_memories')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { stone_id: 'garden', player_id: PLAYER_A, reaction: 'found' })
})

test('uppercase player id is normalized to lowercase', async () => {
  const { status, body } = await api('/stones/tree/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A.toUpperCase(), reaction: 'beautiful' })
  })
  assert.equal(status, 201)
  assert.equal(body.playerId, PLAYER_A)
  const { rows } = await pool.query('SELECT player_id FROM stone_memories')
  assert.equal(rows[0].player_id, PLAYER_A)
})

test('invalid player id is rejected', async () => {
  const bad = ['not-an-address', '0x123', '0x' + 'g'.repeat(40), 42, null, '', undefined]
  for (const playerId of bad) {
    const { status, body } = await api('/stones/garden/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, reaction: 'found' })
    })
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(playerId)}`)
    assert.equal(body.success, false)
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM stone_memories')
  assert.equal(rows[0].c, 0, 'invalid requests must not create rows')
})

test('invalid reaction is rejected', async () => {
  const bad = ['hack', 'LOVE', '', 'found ', 7, null]
  for (const reaction of bad) {
    const { status, body } = await api('/stones/garden/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_A, reaction })
    })
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(reaction)}`)
    assert.equal(body.success, false)
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM stone_memories')
  assert.equal(rows[0].c, 0)
})

test('unknown stone is rejected', async () => {
  const { status, body } = await api('/stones/nope/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  assert.equal(status, 404)
  assert.equal(body.error, 'unknown_stone')
})

test('duplicate player/stone memory returns 409 with the existing memory', async () => {
  await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  const { status, body } = await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'beautiful' })
  })
  assert.equal(status, 409)
  assert.equal(body.success, false)
  assert.equal(body.error, 'already_left_memory')
  assert.equal(body.memory.reaction, 'found', 'the stored reaction is returned, not the new one')

  // only one row exists, the first reaction is kept
  const { rows } = await pool.query('SELECT reaction FROM stone_memories')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].reaction, 'found')
})

test('same player can leave one memory on different stones', async () => {
  await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  const { status, body } = await api('/stones/tree/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'return' })
  })
  assert.equal(status, 201)
  assert.equal(body.memoryCount, 1)
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM stone_memories')
  assert.equal(rows[0].c, 2)
})

test('unexpected fields are rejected', async () => {
  const cases = [
    { playerId: PLAYER_A, reaction: 'found', extra: true },
    { playerId: PLAYER_A, reaction: 'found', count: 500 },
    { playerId: PLAYER_A },
    { reaction: 'found' },
    [],
    'not-an-object'
  ]
  for (const body of cases) {
    const { status } = await api('/stones/garden/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(body)}`)
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM stone_memories')
  assert.equal(rows[0].c, 0)
})

test('malformed JSON and oversized payloads are rejected', async () => {
  const res = await fetch(`${base}/stones/garden/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json'
  })
  assert.equal(res.status, 400)

  const huge = JSON.stringify({ playerId: PLAYER_A, reaction: 'found', pad: 'x'.repeat(20_000) })
  const r = await fetch(`${base}/stones/garden/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: huge
  })
  assert.equal(r.status, 413)
})

test('history is newest first', async () => {
  await api('/stones/ridge/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  await new Promise((r) => setTimeout(r, 5))
  await api('/stones/ridge/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_B, reaction: 'someone' })
  })
  const { status, body } = await api('/stones/ridge')
  assert.equal(status, 200)
  assert.equal(body.stone.memoryCount, 2)
  assert.equal(body.memories.length, 2)
  assert.equal(body.memories[0].playerId, PLAYER_B, 'newest memory first')
  assert.equal(body.memories[1].playerId, PLAYER_A)
})

test('database failure is handled without leaking errors', async () => {
  const badPool = createPool('postgres://nobody:***@127.0.0.1:59999/nope')
  const badApp = createApp(badPool)
  const badServer = badApp.listen(0)
  await new Promise((resolve) => badServer.once('listening', resolve))
  const badBase = `http://127.0.0.1:${(badServer.address() as AddressInfo).port}`

  const stones = await fetch(`${badBase}/stones`)
  assert.equal(stones.status, 500)
  assert.deepEqual(await stones.json(), { error: 'internal_error' })

  const one = await fetch(`${badBase}/stones/garden`)
  assert.equal(one.status, 500)
  assert.deepEqual(await one.json(), { error: 'internal_error' })

  const post = await fetch(`${badBase}/stones/garden/memories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_A, reaction: 'found' })
  })
  assert.equal(post.status, 500)
  const postBody = (await post.json()) as { success: boolean; error: string }
  assert.equal(postBody.success, false)
  assert.match(postBody.error, /internal_error/)
  assert.ok(!JSON.stringify(postBody).includes('ECONNREFUSED'), 'no raw db error leaks')

  await new Promise((resolve) => badServer.close(resolve))
  await badPool.end()
})
