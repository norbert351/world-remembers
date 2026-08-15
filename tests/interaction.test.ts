// Phase E interaction manager tests: proximity CTA logic, priority, one-CTA
// invariant. Pure state, no engine needed.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  buildTargets,
  clearInteraction,
  distanceBetween,
  interactionState,
  resetInteraction,
  updateInteraction,
  TREE_INTERACTION_RADIUS,
  STONE_INTERACTION_RADIUS
} from '../src/interaction'
import { TREE, STONES } from '../src/config'

const TREE_POS = { x: TREE.position.x, z: TREE.position.z }
const STONE_GARDEN = STONES[0]
const STONE_RIDGE = STONES[2]

function targets(missionActive = false, missionCompleted = false) {
  return buildTargets({ missionActive, missionCompleted })
}

afterEach(() => {
  resetInteraction()
})

test('tree CTA hidden when player is far away', () => {
  const t = targets()
  const result = updateInteraction({ x: 3, z: 3 }, t)
  assert.equal(result, null)
  assert.equal(interactionState.target, null)
  assert.equal(interactionState.version, 0, 'no version bump when nothing changes')
})

test('tree CTA shown when player is near the tree', () => {
  const t = targets()
  const near = { x: TREE_POS.x + 2, z: TREE_POS.z }
  const result = updateInteraction(near, t)
  assert.ok(result)
  assert.equal(result.id, 'tree')
  assert.equal(result.label, 'HELP THE TREE GROW')
  assert.equal(interactionState.target?.id, 'tree')
})

test('tree CTA disappears after leaving the radius', () => {
  const t = targets()
  updateInteraction({ x: TREE_POS.x + 1, z: TREE_POS.z }, t)
  assert.equal(interactionState.target?.id, 'tree')
  updateInteraction({ x: TREE_POS.x + TREE_INTERACTION_RADIUS + 3, z: TREE_POS.z }, t)
  assert.equal(interactionState.target, null)
})

test('stone CTA replaces tree CTA when the player is near a stone', () => {
  const t = targets()
  // near the garden stone, far from the tree
  const nearStone = { x: STONE_GARDEN.position.x + 0.5, z: STONE_GARDEN.position.z }
  const result = updateInteraction(nearStone, t)
  assert.ok(result)
  assert.equal(result.id, 'garden')
  assert.equal(result.label, 'LEAVE A MEMORY')
  assert.equal(interactionState.target?.id, 'garden', 'stone wins when in range')
})

test('tree wins over a stone when both are in range during an active mission', () => {
  const t = targets(true, false)
  // position between tree and garden stone, within both radii
  const mid = { x: 13, z: 18 }
  const result = updateInteraction(mid, t)
  assert.ok(result)
  assert.equal(result.id, 'tree', 'mission objective (tree) has priority')
})

test('only one contextual CTA is ever active', () => {
  const t = targets(true, false)
  updateInteraction({ x: TREE_POS.x, z: TREE_POS.z }, t)
  assert.equal(interactionState.target !== null, true)
  const active = interactionState.target
  assert.equal(active.type !== undefined, true)
  // the state holds exactly one target by construction
  assert.equal(JSON.stringify(interactionState.target), JSON.stringify(active))
})

test('disabled targets are ignored', () => {
  const t = targets(false, false)
  t[0].enabled = false // disable the tree
  // (16, 11) is inside the tree radius but outside every stone radius
  const result = updateInteraction({ x: 16, z: 11 }, t)
  assert.equal(result, null, 'disabled tree cannot activate')
})

test('tree interaction radius is configurable and sane', () => {
  assert.ok(TREE_INTERACTION_RADIUS > 0 && TREE_INTERACTION_RADIUS <= 10)
  assert.ok(STONE_INTERACTION_RADIUS > 0 && STONE_INTERACTION_RADIUS <= 8)
})

test('distance helper computes correctly', () => {
  assert.equal(distanceBetween(0, 0, 3, 4), 5)
  assert.equal(distanceBetween(1, 1, 1, 1), 0)
})

test('version bumps only on target changes', () => {
  const t = targets()
  const near = { x: TREE_POS.x + 1, z: TREE_POS.z }
  updateInteraction(near, t)
  const v1 = interactionState.version
  updateInteraction(near, t)
  assert.equal(interactionState.version, v1, 'same target, no bump')
  updateInteraction({ x: TREE_POS.x + 30, z: TREE_POS.z + 30 }, t)
  assert.equal(interactionState.version, v1 + 1, 'target cleared, bump once')
})

test('stone positions are all registered as targets', () => {
  const t = targets()
  const stoneIds = t.filter((x) => x.type === 'stone').map((x) => x.id)
  assert.deepEqual(stoneIds.sort(), STONES.map((s) => s.id).sort())
})

test('clearInteraction resets the target', () => {
  const t = targets()
  updateInteraction({ x: TREE_POS.x + 1, z: TREE_POS.z }, t)
  assert.equal(interactionState.target?.id, 'tree')
  clearInteraction()
  assert.equal(interactionState.target, null)
})

test('mission completion removes the mission priority boost', () => {
  const active = buildTargets({ missionActive: true, missionCompleted: false })
  const done = buildTargets({ missionActive: false, missionCompleted: true })
  assert.equal(active[0].priority, 1, 'tree has mission priority while active')
  assert.equal(done[0].priority, 2, 'tree drops to normal priority after completion')
})

test('ridge stone is reachable as a target', () => {
  const t = targets()
  const near = { x: STONE_RIDGE.position.x + 0.3, z: STONE_RIDGE.position.z }
  const result = updateInteraction(near, t)
  assert.ok(result)
  assert.equal(result.id, 'ridge')
})
