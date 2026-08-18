// Integration tests for Phase F+G: living world state, location memories,
// rare memory discovery, memory level + landmark derivation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import { createPool } from '../src/db'
import {
  communityScore,
  landmarkStageFor,
  memoryLevelFor,
  rareLocationForDay,
  LOCATION_REACTION_IDS
} from '../../shared/world-memory'
import { ALL_OBJECTIVE_IDS } from '../../shared/realms'
import { fragmentsForDay, dayKeyFromDate } from '../../shared/expedition'
import type { Pool } from 'pg'

const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')
// two valid (objective) location ids for location-memory tests
const LOC1 = fragmentsForDay(dayKeyFromDate(new Date()))[0]
const LOC2 = fragmentsForDay(dayKeyFromDate(new Date()))[1]

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
  for (const file of ['001_contributions.sql', '002_memory_stones.sql', '003_expedition.sql', '004_living_world.sql']) {
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
  await pool.query('TRUNCATE expedition_progress')
  await pool.query('TRUNCATE location_memories')
  await pool.query('TRUNCATE rare_memory')
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

// --- World memory level -----------------------------------------------------

test('memory level thresholds and exact boundaries', () => {
  // score = contributions + 5*stoneMemories + 25*completedExpeditions
  assert.equal(memoryLevelFor({ contributions: 0, stoneMemories: 0, completedExpeditions: 0 }).level, 1)
  assert.equal(memoryLevelFor({ contributions: 39, stoneMemories: 0, completedExpeditions: 0 }).level, 1)
  assert.equal(memoryLevelFor({ contributions: 40, stoneMemories: 0, completedExpeditions: 0 }).level, 2, 'exact boundary -> level 2')
  assert.equal(memoryLevelFor({ contributions: 119, stoneMemories: 0, completedExpeditions: 0 }).level, 2)
  assert.equal(memoryLevelFor({ contributions: 120, stoneMemories: 0, completedExpeditions: 0 }).level, 3)
  assert.equal(memoryLevelFor({ contributions: 299, stoneMemories: 0, completedExpeditions: 0 }).level, 3)
  assert.equal(memoryLevelFor({ contributions: 300, stoneMemories: 0, completedExpeditions: 0 }).level, 4)
  assert.equal(memoryLevelFor({ contributions: 599, stoneMemories: 0, completedExpeditions: 0 }).level, 4)
  assert.equal(memoryLevelFor({ contributions: 600, stoneMemories: 0, completedExpeditions: 0 }).level, 5)
  assert.equal(memoryLevelFor({ contributions: 9999, stoneMemories: 0, completedExpeditions: 0 }).level, 5)
})

test('mixed activity feeds the score', () => {
  // 100 contributions + 4 memories + 2 expeditions = 100 + 20 + 50 = 170
  const lvl = memoryLevelFor({ contributions: 100, stoneMemories: 4, completedExpeditions: 2 })
  assert.equal(lvl.score, 170)
  assert.equal(lvl.level, 3)
  assert.equal(lvl.name, 'THE GROWING WORLD')
})

test('community score is deterministic', () => {
  const a = { contributions: 50, stoneMemories: 3, completedExpeditions: 1 }
  assert.equal(communityScore(a), communityScore(a))
})

test('GET /world derives the memory level from real tables', async () => {
  for (let i = 0; i < 45; i++) {
    await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [player(i + 1)])
  }
  const { status, body } = await api('/world')
  assert.equal(status, 200)
  assert.equal(body.contributions, 45)
  assert.equal(body.memoryLevel.level, 2)
  assert.equal(body.memoryLevel.name, 'THE AWAKENING')
  assert.equal(body.communityActivity.contributions, 45)
})

test('GET /world still returns the legacy shape fields', async () => {
  const { body } = await api('/world')
  assert.equal(typeof body.contributions, 'number')
  assert.equal(typeof body.stage, 'string')
})

// --- Landmark ---------------------------------------------------------------

test('landmark progression thresholds and persistence (derived)', () => {
  assert.equal(landmarkStageFor(0).stage, 1)
  assert.equal(landmarkStageFor(2).stage, 1)
  assert.equal(landmarkStageFor(3).stage, 2)
  assert.equal(landmarkStageFor(9).stage, 2)
  assert.equal(landmarkStageFor(10).stage, 3)
  assert.equal(landmarkStageFor(25).stage, 4)
  assert.equal(landmarkStageFor(60).stage, 5)
  assert.equal(landmarkStageFor(200).stage, 5)
})

test('completed expeditions drive the landmark stage in GET /world', async () => {
  // create 12 completed expeditions across players/days
  for (let i = 0; i < 12; i++) {
    await pool.query(
      `INSERT INTO expedition_progress (player_id, day, collected, guardian_hits, completed_at)
       VALUES ($1, ($2 || '-01-01')::date, 7, 63, now())`,
      [player(i + 1), String(2020 + i)]
    )
  }
  const { body } = await api('/world')
  assert.equal(body.landmark.stage, 3)
  assert.equal(body.landmark.name, 'LANTERN')
})

// --- Location memories (G4) -------------------------------------------------

test('leave a location memory', async () => {
  const r = await post(`/locations/${LOC1}/memories`, { playerId: PLAYER, reaction: 'remembered' })
  assert.equal(r.status, 201)
  assert.equal(r.body.success, true)
  assert.equal(r.body.memoryCount, 1)
  assert.equal(r.body.memories[0].reaction, 'remembered')
})

test('duplicate location memory is rejected with the stored reaction', async () => {
  await post(`/locations/${LOC1}/memories`, { playerId: PLAYER, reaction: 'growing' })
  const dup = await post(`/locations/${LOC1}/memories`, { playerId: PLAYER, reaction: 'beautiful' })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error, 'already_remembered')
  assert.equal(dup.body.memory.reaction, 'growing')
})

test('invalid location reaction is rejected', async () => {
  const r = await post(`/locations/${LOC1}/memories`, { playerId: PLAYER, reaction: 'hacked' })
  assert.equal(r.status, 400)
})

test('unknown location is rejected', async () => {
  const r = await post('/locations/zzz/memories', { playerId: PLAYER, reaction: 'growing' })
  assert.equal(r.status, 404)
})

test('unexpected fields are rejected', async () => {
  const r = await post(`/locations/${LOC1}/memories`, { playerId: PLAYER, reaction: 'growing', extra: true })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'unexpected fields are not allowed')
})

test('multiple players can remember the same location', async () => {
  await post(`/locations/${LOC1}/memories`, { playerId: player(1), reaction: 'remembered' })
  await post(`/locations/${LOC1}/memories`, { playerId: player(2), reaction: 'growing' })
  await post(`/locations/${LOC1}/memories`, { playerId: player(3), reaction: 'beautiful' })
  const { body } = await api(`/locations/${LOC1}/memories`)
  assert.equal(body.memoryCount, 3)
  assert.equal(body.memories.length, 3)
})

test('location memories persist across reloads', async () => {
  await post(`/locations/${LOC2}/memories`, { playerId: PLAYER, reaction: 'iwashere' })
  // fresh read (simulated reload) still shows it
  const { body } = await api(`/locations/${LOC2}/memories`)
  assert.equal(body.memoryCount, 1)
  assert.equal(body.memories[0].reaction, 'iwashere')
})

// --- Rare memory (G5) -------------------------------------------------------

test('rare location is deterministic per day', () => {
  const d1a = rareLocationForDay('2026-08-16', ALL_OBJECTIVE_IDS)
  const d1b = rareLocationForDay('2026-08-16', ALL_OBJECTIVE_IDS)
  const d2 = rareLocationForDay('2026-08-17', ALL_OBJECTIVE_IDS)
  assert.equal(d1a, d1b)
  assert.ok(ALL_OBJECTIVE_IDS.includes(d1a as never))
  assert.ok(ALL_OBJECTIVE_IDS.includes(d2 as never))
  // not always the same location across days
  const days = ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
  assert.ok(new Set(days.map((d) => rareLocationForDay(d, ALL_OBJECTIVE_IDS))).size >= 2)
})

test('GET /world reports today\'s rare location undiscovered', async () => {
  const { body } = await api('/world')
  assert.ok(ALL_OBJECTIVE_IDS.includes(body.rareMemory.locationId))
  assert.equal(body.rareMemory.discovered, false)
})

test('first discovery wins; duplicates rejected', async () => {
  const { body } = await api('/world')
  const loc = body.rareMemory.locationId
  const r1 = await post('/world/discover', { playerId: player(1), fragmentId: loc })
  assert.equal(r1.status, 200)
  assert.equal(r1.body.discovered, true)
  const r2 = await post('/world/discover', { playerId: player(2), fragmentId: loc })
  assert.equal(r2.status, 409)
  assert.equal(r2.body.error, 'already_discovered')
  const after = (await api('/world')).body
  assert.equal(after.rareMemory.discovered, true)
})

test('discovering a non-rare location is rejected', async () => {
  const { body } = await api('/world')
  const loc = body.rareMemory.locationId
  const wrong = ALL_OBJECTIVE_IDS.find((id) => id !== loc)
  const r = await post('/world/discover', { playerId: PLAYER, fragmentId: wrong })
  assert.equal(r.status, 404)
  assert.equal(r.body.error, 'not_todays_rare_memory')
})

test('rare memory state survives reload', async () => {
  const { body } = await api('/world')
  await post('/world/discover', { playerId: PLAYER, fragmentId: body.rareMemory.locationId })
  const again = (await api('/world')).body
  assert.equal(again.rareMemory.discovered, true)
  assert.equal(again.rareMemory.locationId, body.rareMemory.locationId)
})

// --- Security ---------------------------------------------------------------

test('client cannot fake world level or event state (no such fields accepted)', async () => {
  const r = await post('/world/discover', {
    playerId: PLAYER,
    fragmentId: 'g4',
    memoryLevel: 5,
    landmarkProgress: 5,
    discovered: true
  })
  assert.equal(r.status, 400)
  assert.equal(r.body.error, 'unexpected fields are not allowed')
})

test('invalid player rejected everywhere', async () => {
  const r = await post(`/locations/${LOC1}/memories`, { playerId: 'nope', reaction: 'growing' })
  assert.equal(r.status, 400)
  const d = await post('/world/discover', { playerId: 'nope', fragmentId: 'g4' })
  assert.equal(d.status, 400)
})

test('db failure returns internal_error without leaking', async () => {
  const badPool = createPool('postgres://nobody:***@127.0.0.1:59999/nope')
  const badApp = createApp(badPool)
  const badServer = badApp.listen(0)
  await new Promise((resolve) => badServer.once('listening', resolve))
  const badBase = `http://127.0.0.1:${(badServer.address() as AddressInfo).port}`
  const res = await fetch(`${badBase}/world`)
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: 'internal_error' })
  await new Promise((resolve) => badServer.close(resolve))
  await badPool.end()
})

test('location reaction whitelist is complete and valid', () => {
  assert.deepEqual([...LOCATION_REACTION_IDS].sort(), ['beautiful', 'growing', 'iwashere', 'remembered'].sort())
})
