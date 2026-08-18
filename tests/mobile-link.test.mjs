// Tests for scripts/mobile-link.mjs — the single source of truth for the
// Decentraland launch URL. Exercises dev vs production separation, the
// PRODUCTION_BLOCKED path, and strict payload validation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDevLaunchUrl,
  buildWorldLaunchUrl,
  resolveLaunch,
  validateLaunchUrl,
  WORLD_PLAY_BASE,
  DEV_SCHEME
} from '../scripts/mobile-link.mjs'

const TUNNEL = 'https://searches-can-ends-durham.trycloudflare.com'
const WORLD = 'the-world-remembers.dcl.eth'
const PROD = `${WORLD_PLAY_BASE}/?realm=${WORLD}&position=0,0`

test('dev preview deep link uses the official scheme + position', () => {
  const url = buildDevLaunchUrl({ previewUrl: TUNNEL })
  assert.equal(url, `${DEV_SCHEME}?preview=${TUNNEL}&position=0,0`)
})

test('world launch URL uses play.decentraland.org + realm + position', () => {
  assert.equal(buildWorldLaunchUrl({ worldName: 'the-world-remembers' }), PROD)
})

test('world name normalizes without .dcl.eth', () => {
  assert.equal(buildWorldLaunchUrl({ worldName: 'the-world-remembers.dcl.eth' }), PROD)
})

test('PRODUCTION_BLOCKED when no world identity yet', () => {
  const r = resolveLaunch({ env: 'world', worldName: '' })
  assert.equal(r.ok, false)
  assert.match(r.reason, /PRODUCTION_BLOCKED/)
  assert.equal(r.url, undefined)
})

test('prod validation rejects secrets / private hosts / http / preview / missing realm', () => {
  const bad = [
    'https://play.decentraland.org/?realm=x.dcl.eth&position=0,0&db=postgres://user:pass@db.neon.tech/neondb',
    'http://10.0.0.5:8001',
    'https://127.0.0.1/preview',
    `${DEV_SCHEME}?preview=${TUNNEL}&position=0,0`,
    'https://play.decentraland.org/?position=0,0',
    'https://play.decentraland.org/?realm=no-suffix&position=0,0'
  ]
  for (const p of bad) {
    const { ok, issues } = validateLaunchUrl({ payload: p, env: 'world' })
    assert.equal(ok, false, `${p} should FAIL (${issues.join('; ')})`)
  }
})

test('prod validation accepts the official world URL', () => {
  const { ok, issues } = validateLaunchUrl({ payload: PROD, env: 'world' })
  assert.equal(ok, true, issues.join('; '))
})

test('dev validation accepts a public tunnel and rejects a LAN/localhost host', () => {
  assert.equal(validateLaunchUrl({ payload: `${DEV_SCHEME}?preview=${TUNNEL}&position=0,0`, env: 'dev' }).ok, true)
  assert.equal(validateLaunchUrl({ payload: `${DEV_SCHEME}?preview=http://localhost:8001&position=0,0`, env: 'dev' }).ok, false)
  assert.equal(validateLaunchUrl({ payload: `${DEV_SCHEME}?preview=http://10.3.4.14:8000&position=0,0`, env: 'dev' }).ok, false)
})

test('secrets are rejected in any env', () => {
  for (const env of ['dev', 'world']) {
    const r = validateLaunchUrl({ payload: `${WORLD_PLAY_BASE}/?realm=x.dcl.eth&position=0,0&p=postgres://u@h/db`, env })
    assert.equal(r.ok, false)
  }
})
