// Tests for the "remembered together" social amplifier core.
// Pure / engine-free: exercises countOthersNear — the rule that the payoff
// amplifies when OTHER explorers are near the Memory Tree (excludes the
// local player, boundary-inclusive, clamps cleanly).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countOthersNear } from '../src/presence-core'

const TREE = { x: 16, z: 16 }
const R = 20

function ping(id: string, x: number, z: number) {
  return { id, x, z }
}

test('counts other players inside the radius, excluding self', () => {
  const selfId = 'walletA'
  const pings = [
    ping(selfId, 16, 16), // self, at the tree heart
    ping('walletB', 20, 16), // 4m away
    ping('walletC', 40, 40) // far away (>37m)
  ]
  assert.equal(countOthersNear(selfId, pings, TREE.x, TREE.z, R), 1)
})

test('counts the local player as itself even without an explicit self id when excluded by the roster', () => {
  // caller already drops the local avatar entity; null selfId then counts all
  const pings = [ping('walletB', 18, 16), ping('walletC', 40, 40)]
  assert.equal(countOthersNear(null, pings, TREE.x, TREE.z, R), 1)
})

test('boundary is inclusive: exactly on the edge counts as together', () => {
  const pings = [ping('walletB', TREE.x + R, TREE.z)]
  assert.equal(countOthersNear('self', pings, TREE.x, TREE.z, R), 1)
})

test('just outside the radius does not count', () => {
  const pings = [ping('walletB', TREE.x + R + 0.1, TREE.z)]
  assert.equal(countOthersNear('self', pings, TREE.x, TREE.z, R), 0)
})

test('solo play returns 0 (nothing ever blocks single players)', () => {
  assert.equal(countOthersNear('self', [], TREE.x, TREE.z, R), 0)
  assert.equal(countOthersNear('self', [ping('walletB', 100, 100)], TREE.x, TREE.z, R), 0)
})

test('handles multiple others and misses on one', () => {
  const pings = [ping('b', 18, 16), ping('c', 16, 14), ping('d', 200, 200)]
  assert.equal(countOthersNear('self', pings, TREE.x, TREE.z, R), 2)
})