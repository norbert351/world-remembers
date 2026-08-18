// Persistence E2E: the scene's real HTTP provider against the real API and
// real PostgreSQL. Spawns the API on port 3999 against the test database and
// runs the exact sequence from the brief: enter, contribute, reload, stage
// boundaries, and the two-client shared-state check.
// Run with: npm run test:e2e
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Client } from 'pg'
import { HttpWorldStateProvider } from '../../src/http-provider'
import { setIdentityResolver } from '../../src/state'
import { stageFor } from '../../shared/world-state'

const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')
// Neon requires TLS; enable it on the raw test client (the app pool already
// handles this via createPool)
const testSsl = /(sslmode|neon\.tech)/i.test(testUrl)
const API_PORT = 3999
const BASE = `http://127.0.0.1:${API_PORT}`

const PLAYER_A = '0x' + 'a'.repeat(40)
const PLAYER_B = '0x' + 'b'.repeat(40)

let api: ChildProcess
let db: Client
let providerA: HttpWorldStateProvider
let providerB: HttpWorldStateProvider

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

async function seed(count: number): Promise<void> {
  await db.query(
    `INSERT INTO contributions (player_id)
     SELECT '0x' || lpad(i::text, 40, '0') FROM generate_series(1, $1) AS i`,
    [count]
  )
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
  await db.query('TRUNCATE contributions')

  providerA = new HttpWorldStateProvider(BASE)
  providerB = new HttpWorldStateProvider(BASE)
  setIdentityResolver(() => PLAYER_A)
})

after(async () => {
  await db.end().catch(() => {})
  api.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 500))
})

test('A: enter with zero contributions shows DORMANT', async () => {
  const count = await providerA.load()
  assert.equal(count, 0)
  assert.equal(stageFor(count), 'DORMANT')
})

test('B: one tap inserts one row and the scene applies the returned state', async () => {
  const count = await providerA.contribute(PLAYER_A)
  assert.equal(count, 1)
  assert.equal(stageFor(count), 'DORMANT')
  const { rows } = await db.query('SELECT player_id FROM contributions')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].player_id, PLAYER_A)
})

test('C: leave and return, the contribution survives', async () => {
  // a fresh provider instance is a fresh scene load
  const count = await providerB.load()
  assert.equal(count, 1, 'the contribution must not disappear')
  assert.equal(stageFor(count), 'DORMANT')
})

test('D: at 100 contributions the tree is AWAKENED after reload', async () => {
  await seed(99)
  const count = await providerB.load()
  assert.equal(count, 100)
  assert.equal(stageFor(count), 'AWAKENED')
})

test('E: at 250 contributions the tree is GROWING after reload', async () => {
  await seed(150)
  const count = await providerB.load()
  assert.equal(count, 250)
  assert.equal(stageFor(count), 'GROWING')
})

test('F: at 500 contributions the tree is FLOURISHING after reload', async () => {
  await seed(250)
  const count = await providerB.load()
  assert.equal(count, 500)
  assert.equal(stageFor(count), 'FLOURISHING')
})

test('two clients share the same world state', async () => {
  const before = await providerA.load()
  assert.equal(before, 500)
  const afterTap = await providerA.contribute(PLAYER_A)
  assert.equal(afterTap, 501)
  // client B reloads and sees the same shared world
  const seenByB = await providerB.load()
  assert.equal(seenByB, 501)
  assert.equal(stageFor(seenByB), 'FLOURISHING')
})
