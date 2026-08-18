// Memory Trail renderer. Turns the navigational trail computed in
// trail-core.ts into a lightweight, emissive, low-poly line of steps.
// Event-driven: it rebuilds only when the expedition state changes.
//
// With Memory Realms, the trail lives INSIDE today's realm, guiding the
// journey: realm entry -> objective 1 -> 2 -> 3 -> the Memory Shrine (the
// restoration point). It is driven by the server's realm + fragment data, so
// it always points at the real next objective.
import {
  engine,
  Entity,
  EntityState,
  Material,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { expeditionCompleted, expeditionFragments, expeditionState } from './expedition'
import { sampleTrail, trailSegment, type Point } from './trail-core'
import { realmById, realmWorld } from '../shared/realms'

const SPACING = 1.5
const DOT_SCALE = 0.16
const END_SCALE = 0.26

let trailEntities: Entity[] = []
let appliedVersion = -1

function clearTrail(): void {
  for (const e of trailEntities) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  trailEntities.length = 0
}

function addDot(p: Point, scale: number, intensity: number): void {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(p.x, 0.06, p.z),
    scale: Vector3.create(scale, scale, scale)
  })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, {
    emissiveColor: Color3.fromHexString('#9fd8ff'),
    emissiveIntensity: intensity,
    albedoColor: Color4.fromHexString('#0a1220cc')
  })
  trailEntities.push(e)
}

// Compute the in-realm navigation leg. Uses the realm's entry portal as the
// anchor for the first leg and the shrine as the final destination.
function realmAnchor(): { entry: Point; shrine: Point } {
  const realm = expeditionState.state?.realm ? realmById(expeditionState.state.realm.id) : undefined
  if (realm) {
    return {
      entry: realmWorld(realm, realm.portalIn.local),
      shrine: realmWorld(realm, realm.shrine.local)
    }
  }
  return { entry: { x: 48, z: 96 }, shrine: { x: 90, z: 140 } }
}

// Recompute and redraw the trail from current expedition state. Idempotent.
export function syncMissionTrail(): void {
  const frags = expeditionFragments()
  if (frags.length === 0 || expeditionCompleted()) {
    clearTrail()
    appliedVersion = expeditionState.version
    return
  }
  const { entry, shrine } = realmAnchor()
  // all collected -> trail leads to the shrine (restoration point)
  const allCollected = frags.every((f) => f.collected)
  const seg = allCollected
    ? { from: frags[frags.length - 1]?.location ?? entry, to: shrine, next: null, allCollected: true }
    : trailSegment(frags, entry)
  if (seg === null) {
    clearTrail()
    appliedVersion = expeditionState.version
    return
  }
  clearTrail()
  const dots = sampleTrail(seg, SPACING)
  const len = dots.length
  dots.forEach((p, i) => {
    const isEnd = i === len - 1
    addDot(p, isEnd ? END_SCALE : DOT_SCALE, isEnd ? 2.8 : 1.5)
  })
  appliedVersion = expeditionState.version
}

// Called from the scene's low-frequency tick. Rebuilds only on a real state
// change (version bump), so it never does work per frame.
export function missionTrailSystem(_dt: number): void {
  if (expeditionState.version === appliedVersion) return
  syncMissionTrail()
}

// cleanup for scene reload / tests
export function resetMissionTrail(): void {
  clearTrail()
  appliedVersion = -1
}

// exported for the smoke test: how many trail steps are on the ground
export function missionTrailCount(): number {
  return trailEntities.length
}
