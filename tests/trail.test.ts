// Memory Trail navigation math tests. The trail is engine-free so these run
// directly in node with zero stubbing: it advances from the tree toward the
// next uncollected fragment, then home once everything is collected.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sampleTrail, trailSegment, headingFor, type FragmentLike, type Point } from '../src/trail-core'

const HOME: Point = { x: 16, z: 16 }

function frag(id: string, x: number, z: number, collected: boolean): FragmentLike {
  return { id, location: { x, z }, collected }
}

// 1. mission appears: none collected -> trail leads from the tree (home) to
// the first fragment
test('trail leads home -> first fragment when nothing collected', () => {
  const fs = [frag('g1', 6, 14, false), frag('l1', 26, 14, false), frag('m1', 22, 20, false)]
  const seg = trailSegment(fs, HOME)
  assert.ok(seg)
  assert.equal(seg!.allCollected, false)
  assert.equal(seg!.next!.id, 'g1')
  assert.deepEqual(seg!.from, HOME)
  assert.deepEqual(seg!.to, { x: 6, z: 14 })
})

// 2. after collecting fragment 1, the trail advances: from last collected to
// the next uncollected
test('trail advances to next fragment after each collection', () => {
  const fs = [frag('g1', 6, 14, true), frag('l1', 26, 14, false), frag('m1', 22, 20, false)]
  const seg = trailSegment(fs, HOME)
  assert.ok(seg)
  // from = last collected g1, to = next uncollected l1
  assert.deepEqual(seg!.from, { x: 6, z: 14 })
  assert.deepEqual(seg!.to, { x: 26, z: 14 })
  assert.equal(seg!.next!.id, 'l1')
})

// 3. after two collections the trail points at the third fragment
test('trail points at the third fragment after two collected', () => {
  const fs = [frag('g1', 6, 14, true), frag('l1', 26, 14, true), frag('m1', 22, 20, false)]
  const seg = trailSegment(fs, HOME)
  assert.ok(seg)
  assert.deepEqual(seg!.to, { x: 22, z: 20 })
  assert.equal(seg!.next!.id, 'm1')
})

// 4. all collected -> the trail leads home to the tree for restoration
test('trail leads home when all fragments collected', () => {
  const fs = [frag('g1', 6, 14, true), frag('l1', 26, 14, true), frag('m1', 22, 20, true)]
  const seg = trailSegment(fs, HOME)
  assert.ok(seg)
  assert.equal(seg!.allCollected, true)
  assert.equal(seg!.next, null)
  assert.deepEqual(seg!.to, HOME)
})

// 5. no fragments -> no trail
test('no fragments -> no trail leg', () => {
  assert.equal(trailSegment([], HOME), null)
})

// 6. sampleTrail places dots at a regular spacing and includes the endpoint
test('sampleTrail places evenly spaced steps plus the endpoint', () => {
  const seg = { from: { x: 0, z: 0 }, to: { x: 12, z: 0 } }
  const dots = sampleTrail(seg, 3)
  // spacing 3m over 12m -> 4 steps (3,6,9,12)
  assert.equal(dots.length, 4)
  assert.deepEqual(dots[0], { x: 3, z: 0 })
  assert.deepEqual(dots[dots.length - 1], { x: 12, z: 0 })
})

// 7. headingFor returns home guidance when complete, follow-trail otherwise
test('headingFor reflects the mission stage', () => {
  const active = trailSegment([frag('g1', 6, 14, false)], HOME)
  assert.equal(headingFor(active), 'Follow the trail')
  const done = trailSegment([frag('g1', 6, 14, true)], HOME)
  assert.equal(headingFor(done), 'Return to the Memory Tree')
  assert.equal(headingFor(null), '')
})
