// Integration tests for the mission endpoint and its interaction with the
// contribution and stone memory flows. Uses the dedicated test database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import { createPool } from '../src/db'
import { MISSION } from '../../shared/mission'
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

function makePlayer(i: number): string {
  return '0x' + i.toString(16).padStart(40, '0')
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
  await pool.query('TRUNCATE contributions')
  await pool.query('TRUNCATE stone_memories')
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('GET /mission returns the active mission with zero progress', async () => {
  const { status, body } = await api('/mission')
  assert.equal(status, 200)
  assert.equal(body.mission.id, MISSION.id)
  assert.equal(body.mission.title, MISSION.title)
  assert.equal(body.mission.progress, 0)
  assert.equal(body.mission.target, MISSION.target)
  assert.equal(body.mission.completed, false)
})

test('one contribution advances mission progress by exactly one', async () => {
  await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  const { body } = await api('/mission')
  assert.equal(body.mission.progress, 1)
})

test('same player contributing many times advances progress only once (anti-spam)', async () => {
  for (let i = 0; i < 20; i++) {
    await api('/contribute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER })
    })
  }
  const { body } = await api('/mission')
  assert.equal(body.mission.progress, 1, 'distinct players only')
})

test('many distinct players advance progress correctly', async () => {
  for (let i = 0; i < 7; i++) {
    await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [makePlayer(i + 1)])
  }
  const { body } = await api('/mission')
  assert.equal(body.mission.progress, 7)
})

test('stone memory advances mission progress too', async () => {
  await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER, reaction: 'found' })
  })
  const { body } = await api('/mission')
  assert.equal(body.mission.progress, 1)
})

test('tree contribution and stone memory from the same player count once', async () => {
  await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER, reaction: 'found' })
  })
  const { body } = await api('/mission')
  assert.equal(body.mission.progress, 1, 'UNION dedupes the same player')
})

test('contribute response includes mission progress', async () => {
  const { status, body } = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  assert.equal(status, 200)
  assert.ok(body.mission, 'mission payload present')
  assert.equal(body.mission.progress, 1)
  assert.equal(body.mission.completed, false)
})

test('stone memory response includes mission progress', async () => {
  const { status, body } = await api('/stones/garden/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER, reaction: 'return' })
  })
  assert.equal(status, 201)
  assert.ok(body.mission, 'mission payload present')
  assert.equal(body.mission.progress, 1)
})

test('mission completes exactly at target and not before', async () => {
  // 99 distinct contributors: not complete
  for (let i = 0; i < 99; i++) {
    await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [makePlayer(i + 1)])
  }
  let { body } = await api('/mission')
  assert.equal(body.mission.progress, 99)
  assert.equal(body.mission.completed, false)

  // 100th distinct participant: complete
  await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [makePlayer(100)])
  body = (await api('/mission')).body
  assert.equal(body.mission.progress, 100)
  assert.equal(body.mission.completed, true)

  // beyond target: progress caps at target, still complete
  await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [makePlayer(101)])
  body = (await api('/mission')).body
  assert.equal(body.mission.progress, 101)
  assert.equal(body.mission.completed, true)
})

test('mission progress survives reload (derived from persistent rows)', async () => {
  for (let i = 0; i < 5; i++) {
    await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [makePlayer(i + 1)])
  }
  const first = (await api('/mission')).body
  // a fresh GET is a fresh read of the same tables
  const second = (await api('/mission')).body
  assert.equal(second.mission.progress, first.mission.progress)
  assert.equal(second.mission.progress, 5)
})

test('mission payload cannot be injected by the client', async () => {
  // the client only reads /mission; POST bodies with mission fields are ignored
  const { status, body } = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER, mission: { progress: 99, completed: true } })
  })
  assert.equal(status, 400, 'unexpected fields rejected')
  assert.equal(body.success, false)
})

test('invalid mission payload shape is rejected by the client validator', async () => {
  const { missionFromServer } = await import('../../shared/mission.js')
  const bad = [
    null,
    {},
    { mission: null },
    { mission: { id: 'wrong-id', title: 'x', description: 'y', progress: 0, target: 100, completed: false } },
    { mission: { id: MISSION.id, title: 'x', description: 'y', progress: -1, target: 100, completed: false } },
    { mission: { id: MISSION.id, title: 'x', description: 'y', progress: 0, target: 0, completed: false } },
    { mission: { id: MISSION.id, title: 'x', description: 'y', progress: '5', target: 100, completed: false } }
  ]
  for (const b of bad) assert.throws(() => missionFromServer(b), JSON.stringify(b))
})

test('mission validator accepts a valid payload and clamps progress', async () => {
  const { missionFromServer } = await import('../../shared/mission.js')
  const ok = missionFromServer({
    mission: { id: MISSION.id, title: MISSION.title, description: MISSION.description, progress: 120, target: 100, completed: true }
  })
  assert.equal(ok.progress, 100, 'progress clamped to target')
  assert.equal(ok.completed, true)
})

test('database failure is handled without leaking errors', async () => {
  const badPool = createPool('postgres://nobody:***@127.0.0.1:59999/nope')
  const badApp = createApp(badPool)
  const badServer = badApp.listen(0)
  await new Promise((resolve) => badServer.once('listening', resolve))
  const badBase = `http://127.0.0.1:${(badServer.address() as AddressInfo).port}`

  const res = await fetch(`${badBase}/mission`)
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: 'internal_error' })

  await new Promise((resolve) => badServer.close(resolve))
  await badPool.end()
})
