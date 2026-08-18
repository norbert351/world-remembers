// Memory Trail core — pure, engine-free navigation math.
//
// The trail turns the daily Expedition into a guided loop:
//   tree -> fragment 1 -> fragment 2 -> fragment 3 -> tree
// As the player collects each fragment the trail advances to the next one,
// so the world itself always answers "where do I go now?".
//
// This module has NO @dcl/sdk imports so it is directly unit-testable in
// node. The renderer (src/mission-trail.ts) turns the computed segments
// into emissive primitives in the scene.

export interface Point {
  x: number
  z: number
}

export interface FragmentLike {
  id: string
  location: Point
  collected: boolean
}

// The active trail leg: from the current position (the tree when nothing is
// collected yet, otherwise the last collected fragment) toward the next
// uncollected fragment. When everything is collected the trail leads home to
// the tree for the restoration.
// Fragments must be in today's discovery/route order (the server sends them
// in order). Returns null when there is no active leg (expedition complete
// and no restore point, or no fragments at all).
export function trailSegment(
  fragments: readonly FragmentLike[],
  home: Point
): { from: Point; to: Point; next: FragmentLike | null; allCollected: boolean } | null {
  if (fragments.length === 0) return null

  const collected = fragments.filter((f) => f.collected)
  const allCollected = collected.length === fragments.length
  const next = fragments.find((f) => !f.collected) ?? null

  // current position: last collected fragment, or the tree if none yet
  const from: Point =
    collected.length > 0 && !allCollected ? collected[collected.length - 1].location : allCollected ? home : home

  // target: the next uncollected fragment, or the tree when all are collected
  const to: Point = next ? next.location : home

  return { from, to, next, allCollected }
}

// Sample the active leg into a line of dots so the renderer can place one
// emissive step per sample. Dots are placed at a fixed spacing (meters).
// A brighter endpoint dot is always included at `to`. Returns [] when the
// leg is shorter than the endpoint-only threshold.
export function sampleTrail(segment: { from: Point; to: Point }, spacing: number): Point[] {
  const dx = segment.to.x - segment.from.x
  const dz = segment.to.z - segment.from.z
  const dist = Math.hypot(dx, dz)
  const dots: Point[] = []
  if (spacing <= 0 || dist <= 0) {
    // degenerate: just the endpoint
    return [{ x: segment.to.x, z: segment.to.z }]
  }
  const count = Math.max(1, Math.floor(dist / spacing))
  for (let i = 1; i <= count; i++) {
    const t = i / count
    dots.push({ x: segment.from.x + dx * t, z: segment.from.z + dz * t })
  }
  return dots
}

// Convenience used by tests and the UI: human "next objective" text for the
// current trail leg, e.g. "Find the memory near the garden".
export function headingFor(segment: { next: FragmentLike | null; allCollected: boolean } | null): string {
  if (segment === null) return ''
  if (segment.allCollected) return 'Return to the Memory Tree'
  if (segment.next === null) return ''
  return 'Follow the trail'
}
