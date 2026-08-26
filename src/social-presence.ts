// Social presence: a live, cheap readout of how many OTHER players are near
// the Memory Tree right now. Uses the SDK's public player helper
// (@dcl/sdk/players onEnterScene/onLeaveScene) to maintain a roster of every
// avatar in the scene, then reads live transforms on a slow 0.5s tick.
// Zero new entities, zero per-frame work. Feeds the "remembered together"
// amplification in the restoration payoff and the UI's "friends are here"
// invite chip.
import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { onEnterScene, onLeaveScene } from '@dcl/sdk/players'
import { TREE } from './config'
import { countOthersNear, type PresencePing } from './presence-core'

// Reach of "togetherness": how close another avatar must be to the tree to
// join a payoff. Spans the plaza and the immediate garden (scene meters).
export const TOGETHER_RADIUS = 20
const SCAN_TICK = 0.5

// entity -> userId for every avatar currently in the scene (self included;
// the local player is excluded by id at counting time).
const roster = new Map<Entity, string>()
let acc = 0
let cached: { n: number; fresh: boolean } = { n: 0, fresh: false }
let initialized = false

function scan(): void {
  cached.fresh = true
  const pings: PresencePing[] = []
  for (const [entity, id] of roster) {
    if (entity === engine.PlayerEntity) continue // never count the local player
    const t = Transform.getOrNull(entity)
    if (!t) continue
    pings.push({ id, x: t.position.x, z: t.position.z })
  }
  cached.n = countOthersNear(null, pings, TREE.position.x, TREE.position.z, TOGETHER_RADIUS)
}

// Call once during scene init: subscribes to enter/leave and installs the
// low-frequency scan system. Idempotent.
export function initSocialPresence(): void {
  if (initialized) return
  initialized = true
  onEnterScene((p) => {
    if (p.userId) roster.set(p.entity, p.userId)
    cached.fresh = false
  })
  onLeaveScene((userId) => {
    for (const [e, id] of roster) if (id === userId) roster.delete(e)
    cached.fresh = false
  })
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < SCAN_TICK) return
    acc = 0
    scan()
  })
}

// Number of OTHER players currently inside the tree's together-reach.
// 0 when solo or before the first scan resolves. Safe to call from the UI
// render pass: it only re-scans when the cached value has gone stale.
export function nearbyOthersAtTree(): number {
  if (!cached.fresh) scan()
  return cached.n
}