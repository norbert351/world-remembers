// Memory Stones persistence E2E: the scene's real HttpStoneProvider against
// the real API and real PostgreSQL. Spawns the API on port 3998 against the
// test database and runs the brief's Player A / Player B / reload sequence.
// Run with: npm run test:e2e
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Client } from 'pg'
import { HttpStoneProvider } from '../../src/http-provider'
import { setStoneIdentityResolver } from '../../src/stone-state'

const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')
// Neon requires TLS; enable it on the raw test client (the app pool already
// handles this via createPool)
const testSsl = /(sslmode|neon\.tech)/i.test(testUrl)
const API_PORT = 3998
const BASE = `http://127.0.0.1:${API_PORT}`

const PLAYER_A = '0x' + 'a'.repeat(40)
const PLAYER_B = '0x' + 'b'.repeat(40)

let api: ChildProcess
let db: Client

async function waitForHealth(attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('API did not become healthy')
}

before(async () => {
  api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, PORT: String(API_PORT), DATABASE_URL: testUrl },
    stdio: 'ignore'
  })
  await waitForHealth()

  db = new Client({ connectionString: testUrl, ...(testSsl ? { ssl: { rejectUnauthorized: false } } : {}) })
  await db.connect()
  // self-contained: apply both migrations before touching data
  for (const file of ['001_contributions.sql', '002_memory_stones.sql']) {
    const sql = readFileSync(join(__dirname, '..', 'migrations', file), 'utf8')
    await db.query(sql)
  }
  await db.query('TRUNCATE stone_memories')
  setStoneIdentityResolver(() => PLAYER_A)
})

after(async () => {
  await db.end().catch(() => {})
  api.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 500))
})

test('A: player A sees three empty stones', async () => {
  const provider = new HttpStoneProvider(BASE)
  const stones = await provider.listStones()
  assert.equal(stones.length, 3)
  for (const s of stones) assert.equal(s.memoryCount, 0)
})

test('B: player A leaves a memory, it is stored and visible', async () => {
  const provider = new HttpStoneProvider(BASE)
  const before = await provider.loadStone('garden')
  assert.equal(before.memoryCount, 0)
  const after = await provider.leaveMemory('garden', PLAYER_A, 'found')
  assert.equal(after.memoryCount, 1)
  assert.equal(after.memories[0].playerId, PLAYER_A)
  assert.equal(after.memories[0].reaction, 'found')
  const { rows } = await db.query('SELECT stone_id, player_id, reaction FROM stone_memories')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { stone_id: 'garden', player_id: PLAYER_A, reaction: 'found' })
})

test('C: player B sees player A memory, leaves own, both persist', async () => {
  // fresh provider instance = fresh scene load for player B
  const providerB = new HttpStoneProvider(BASE)
  const seen = await providerB.loadStone('garden')
  assert.equal(seen.memoryCount, 1)
  assert.equal(seen.memories[0].playerId, PLAYER_A, 'A memory is visible to B')

  await providerB.leaveMemory('garden', PLAYER_B, 'someone')
  const both = await providerB.loadStone('garden')
  assert.equal(both.memoryCount, 2)
  const players = both.memories.map((m) => m.playerId)
  assert.ok(players.includes(PLAYER_A))
  assert.ok(players.includes(PLAYER_B))
  // newest first: B is newer than A
  assert.equal(both.memories[0].playerId, PLAYER_B)
})

test('D: reload keeps the memories', async () => {
  const provider = new HttpStoneProvider(BASE)
  const reloaded = await provider.loadStone('garden')
  assert.equal(reloaded.memoryCount, 2)
  assert.equal(reloaded.memories.length, 2)
  const players = reloaded.memories.map((m) => m.playerId)
  assert.ok(players.includes(PLAYER_A))
  assert.ok(players.includes(PLAYER_B))
})

test('E: duplicate from the same player is rejected', async () => {
  const provider = new HttpStoneProvider(BASE)
  await assert.rejects(
    () => provider.leaveMemory('garden', PLAYER_A, 'return'),
    /already_left_memory/
  )
  const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM stone_memories')
  assert.equal(rows[0].c, 2, 'no third row')
})

test('F: counts in the list endpoint match the histories', async () => {
  const provider = new HttpStoneProvider(BASE)
  const stones = await provider.listStones()
  const garden = stones.find((s) => s.id === 'garden')
  assert.equal(garden?.memoryCount, 2)
})
