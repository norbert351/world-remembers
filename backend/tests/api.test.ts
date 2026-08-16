// Integration tests for the world-remembers API.
// Uses a dedicated test database (world_remembers_test) derived from
// DATABASE_URL. Run with: npm test  (backend/.env must exist)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app'
import { createPool, insertContribution } from '../src/db'
import type { Pool } from 'pg'

// derive the test database from the configured dev database
const devUrl = process.env.DATABASE_URL
assert.ok(devUrl, 'DATABASE_URL must be set (backend/.env)')
const testUrl = devUrl.replace(/\/[^/]+$/, '/world_remembers_test')

const PLAYER = '0x' + '1'.repeat(40)
const OTHER = '0x' + '2'.repeat(40)

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

async function seed(count: number): Promise<void> {
  await pool.query(
    `INSERT INTO contributions (player_id)
     SELECT '0x' || lpad(i::text, 40, '0') FROM generate_series(1, $1) AS i`,
    [count]
  )
}

before(async () => {
  pool = createPool(testUrl)
  // self-contained setup: apply the migration, then start from empty
  const sql = readFileSync(join(__dirname, '..', 'migrations', '001_contributions.sql'), 'utf8')
  await pool.query(sql)
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

test('GET /health reports ok with database up', async () => {
  const { status, body } = await api('/health')
  assert.equal(status, 200)
  assert.deepEqual(body, { status: 'ok', db: 'up' })
})

test('GET /world with zero contributions returns 0 DORMANT', async () => {
  const { status, body } = await api('/world')
  assert.equal(status, 200)
  // legacy contract fields (the response also carries living-world state)
  assert.equal(body.contributions, 0)
  assert.equal(body.stage, 'DORMANT')
})

test('POST /contribute creates exactly one row and returns state', async () => {
  const { status, body } = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  assert.equal(status, 200)
  assert.equal(body.success, true)
  assert.equal(body.contributions, 1)
  assert.equal(body.stage, 'DORMANT')
  // the database really has one row, attributed to this player
  const { rows } = await pool.query('SELECT player_id FROM contributions')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].player_id, PLAYER.toLowerCase())
})

test('POST /contribute then GET /world reflects the contribution', async () => {
  await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  const { status, body } = await api('/world')
  assert.equal(status, 200)
  assert.equal(body.contributions, 1)
  assert.equal(body.stage, 'DORMANT')
})

test('multiple contributions accumulate', async () => {
  for (let i = 0; i < 3; i++) {
    const { status, body } = await api('/contribute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: i % 2 === 0 ? PLAYER : OTHER })
    })
    assert.equal(status, 200)
    assert.equal(body.contributions, i + 1)
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM contributions')
  assert.equal(rows[0].c, 3)
})

test('stage transitions at the exact boundaries', async () => {
  const cases: Array<[number, string]> = [
    [99, 'DORMANT'],
    [100, 'AWAKENED'],
    [249, 'AWAKENED'],
    [250, 'GROWING'],
    [499, 'GROWING'],
    [500, 'FLOURISHING']
  ]
  for (const [target, expected] of cases) {
    await pool.query('TRUNCATE contributions')
    await seed(target)
    const { status, body } = await api('/world')
    assert.equal(status, 200, `status for ${target}`)
    assert.equal(body.contributions, target)
    assert.equal(body.stage, expected, `stage for ${target}`)
  }
})

test('player id is normalized and validated', async () => {
  // uppercase address is accepted and stored lowercase
  await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER.toUpperCase() })
  })
  const { rows } = await pool.query('SELECT player_id FROM contributions')
  assert.equal(rows[0].player_id, PLAYER.toLowerCase())

  // invalid identities are rejected with 400 and no row
  const bad = ['not-an-address', '0x123', '0x' + 'g'.repeat(40), 42, null, '']
  for (const playerId of bad) {
    const { status, body } = await api('/contribute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId })
    })
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(playerId)}`)
    assert.equal(body.success, false)
  }
  const afterBad = await pool.query('SELECT COUNT(*)::int AS c FROM contributions')
  assert.equal(afterBad.rows[0].c, 1, 'invalid requests must not create rows')
})

test('invalid requests are rejected', async () => {
  // malformed JSON
  const res = await fetch(`${base}/contribute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json'
  })
  assert.equal(res.status, 400)

  // empty body object
  let r = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  })
  assert.equal(r.status, 400)

  // missing playerId
  r = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'x' })
  })
  assert.equal(r.status, 400)

  // client attempts to submit a count: must be rejected, not trusted
  r = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER, contributions: 500 })
  })
  assert.equal(r.status, 400)
  assert.match(r.body.error, /unexpected/)

  // array body
  r = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([PLAYER])
  })
  assert.equal(r.status, 400)

  // oversized payload
  const huge = JSON.stringify({ playerId: PLAYER, pad: 'x'.repeat(20_000) })
  r = await api('/contribute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: huge
  })
  assert.equal(r.status, 413)

  // nothing was stored by any of the rejected requests
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM contributions')
  assert.equal(rows[0].c, 0)
})

test('database failure is handled without leaking errors', async () => {
  // a pool pointed at a closed port fails fast on every query
  const badPool = createPool('postgres://nobody:nothing@127.0.0.1:59999/nope')
  const badApp = createApp(badPool)
  const badServer = badApp.listen(0)
  await new Promise((resolve) => badServer.once('listening', resolve))
  const badBase = `http://127.0.0.1:${(badServer.address() as AddressInfo).port}`

  const health = await fetch(`${badBase}/health`)
  assert.equal(health.status, 503)
  assert.deepEqual(await health.json(), { status: 'degraded', db: 'down' })

  const world = await fetch(`${badBase}/world`)
  assert.equal(world.status, 500)
  assert.deepEqual(await world.json(), { error: 'internal_error' })

  const contribute = await fetch(`${badBase}/contribute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER })
  })
  assert.equal(contribute.status, 500)
  const contributeBody = (await contribute.json()) as { success: boolean; error: string }
  assert.equal(contributeBody.success, false)
  assert.match(contributeBody.error, /internal_error/)
  // no raw database error text leaks to the client
  assert.ok(!JSON.stringify(contributeBody).includes('ECONNREFUSED'))

  await new Promise((resolve) => badServer.close(resolve))
  await badPool.end()
})

test('CORS headers are present and permissive by default', async () => {
  const res = await fetch(`${base}/world`, {
    headers: { origin: 'https://play.decentraland.org' }
  })
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
})

test('insertContribution helper returns the running total', async () => {
  const first = await insertContribution(pool, PLAYER)
  const second = await insertContribution(pool, OTHER)
  assert.equal(first, 1)
  assert.equal(second, 2)
})
