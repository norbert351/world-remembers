// Presence core: the pure, engine-free counting logic behind the "remembered
// together" social amplifier. Kept free of @dcl/sdk imports so it can be unit
// tested in isolation (see tests/presence-core.test.ts).
//
// The rule is simple and additive: when the player brings a memory back while
// one or more OTHER explorers are near the Memory Tree, the payoff visibly
// amplifies ("brought back together"). Solo play is never gated — this only
// ever makes a shared moment warmer.

export interface PresencePing {
  id: string // userId of the avatar at this position
  x: number
  z: number
}

// Count OTHER players (excluding selfId) within `radius` meters of (cx, cz).
// Boundary-inclusive: exactly on the edge counts as together.
export function countOthersNear(
  selfId: string | null,
  pings: PresencePing[],
  cx: number,
  cz: number,
  radius: number
): number {
  const r2 = radius * radius
  let n = 0
  for (const p of pings) {
    if (p.id !== '' && p.id === selfId) continue // never count the local player
    const dx = p.x - cx
    const dz = p.z - cz
    if (dx * dx + dz * dz <= r2) n++
  }
  return n
}