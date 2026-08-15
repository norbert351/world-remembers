// Mission completion payoff. When the server says the mission is complete,
// the world visibly changes: a daisy bloom ring appears around the plaza,
// the tree embers brighten, and a single Memory Moment plays. Because
// completion is server-derived (see shared/mission.ts), a reload restores
// the bloom automatically — the world stays changed.
import {
  engine,
  Entity,
  EntityState,
  GltfContainer,
  Material,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'
import { TREE } from './config'
import { missionCompleted } from './mission'

const bloomEntities: Entity[] = []
let bloomApplied = false
let bloomRingScale = 0
let bloomRingActive = false
const BLOOM_RING_DURATION = 2.5

// The restored garden bloom: 10 daisies in a wide ring plus a soft ground
// glow. Idempotent: calling twice never duplicates entities.
export function applyRestoredGarden(): void {
  if (bloomApplied) return
  bloomApplied = true

  // ground glow disc under the tree, wider and warmer
  const glow = engine.addEntity()
  Transform.create(glow, {
    position: Vector3.create(TREE.position.x, 0.02, TREE.position.z),
    scale: Vector3.create(1, 0.02, 1)
  })
  MeshRenderer.setCylinder(glow, 4.6, 4.6)
  Material.setPbrMaterial(glow, {
    emissiveColor: Color3.fromHexString('#ffd9a0'),
    emissiveIntensity: 0.5,
    albedoColor: { r: 0.25, g: 0.18, b: 0.06, a: 0.8 }
  })
  bloomEntities.push(glow)

  // daisy ring: the garden blooms again
  const count = 10
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const flower = engine.addEntity()
    Transform.create(flower, {
      position: Vector3.create(
        TREE.position.x + Math.cos(angle) * 3.4,
        0.05,
        TREE.position.z + Math.sin(angle) * 3.4
      ),
      rotation: Quaternion.fromEulerDegrees(0, (i / count) * 360, 0)
    })
    GltfContainer.create(flower, {
      src: 'assets/Models/flower-daisy.glb',
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
    bloomEntities.push(flower)
  }
}

// play the bloom-in animation once when the mission completes live
export function playRestoredBloom(): void {
  bloomRingScale = 0
  bloomRingActive = true
}

// tiny system: pops the bloom entities in over a couple of seconds,
// daisies one by one with a small stagger
export function bloomSystem(dt: number): void {
  if (!bloomRingActive) return
  bloomRingScale += dt / BLOOM_RING_DURATION
  const k = Math.min(1, bloomRingScale)
  for (let i = 0; i < bloomEntities.length; i++) {
    const e = bloomEntities[i]
    const t = Transform.getMutable(e)
    if (i === 0) continue // the ground glow: always visible
    const appear = Math.min(1, Math.max(0, (k - (i - 1) * 0.06) * 4))
    if (appear <= 0) {
      t.scale = Vector3.create(0.001, 0.001, 0.001)
    } else {
      t.scale = Vector3.create(appear, appear, appear)
    }
  }
  if (k >= 1) bloomRingActive = false
}

// called when mission state loads/applies: restore the world if completed
export function syncMissionCompletion(): void {
  if (missionCompleted() && !bloomApplied) {
    applyRestoredGarden()
    playRestoredBloom()
  }
}

// cleanup for scene reload / tests
export function resetBloom(): void {
  for (const e of bloomEntities) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  bloomEntities.length = 0
  bloomApplied = false
  bloomRingActive = false
}

// exported for tests: how many bloom entities exist
export function bloomEntityCount(): number {
  return bloomEntities.length
}
