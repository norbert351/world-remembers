// World evolution (F2), memory trails (G1) and the rare memory seed (G5).
// Reuses existing scene entities where possible; adds only a few
// primitives. All event-driven: applied when the living-world state
// changes, never polled per frame.
import {
  engine,
  Entity,
  EntityState,
  Material,
  MeshRenderer,
  SkyboxTime,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { levelVisuals, TREE } from './config'
import { FRAGMENT_LOCATIONS, type ExpeditionFragmentId } from '../shared/expedition'
import {
  livingCommunityActivity,
  livingLandmarkStage,
  livingMemoryLevel,
  livingRareDiscovered,
  livingRareLocation
} from './living-world'
import { applyLighthouseStage } from './lighthouse'

// --- level evolution --------------------------------------------------------

// daisy ring around the plaza center that grows with the memory level
let levelRing: Entity[] = []
let appliedLevel = 0

export function applyWorldLevel(level: number): void {
  const v = levelVisuals(level)
  appliedLevel = level

  // level flower ring: reuse the verified daisy GLB, grow by level
  const target = v.flowerRing
  while (levelRing.length < target) {
    const f = engine.addEntity()
    Transform.create(f, {
      position: Vector3.create(
        TREE.position.x + Math.cos((levelRing.length / target) * Math.PI * 2) * 2.1,
        0.05,
        TREE.position.z + Math.sin((levelRing.length / target) * Math.PI * 2) * 2.1
      )
    })
    MeshRenderer.setSphere(f) // lightweight placeholder flower
    Material.setPbrMaterial(f, {
      emissiveColor: Color3.fromHexString('#ffb45e'),
      emissiveIntensity: 0.6 + v.treeGlowBoost,
      albedoColor: Color4.fromHexString('#ffb45e')
    })
    levelRing.push(f)
  }
  // hide extras beyond the target
  levelRing.forEach((e, i) => {
    const t = Transform.getMutable(e)
    t.scale.x = i < target ? 0.14 : 0.001
    t.scale.y = i < target ? 0.14 : 0.001
    t.scale.z = i < target ? 0.14 : 0.001
  })

  // sky shifts subtly with the world's memory
  SkyboxTime.getMutable(engine.RootEntity).fixedTime = v.skyTime
}

export function worldLevelApplied(): number {
  return appliedLevel
}

// --- memory trails (G1) -----------------------------------------------------

// Completed expedition sites leave a glowing trace that grows with the
// number of completions. Driven by living-world state: the trail count is
// derived from completed expeditions (capped visually).
let trailEntities: Entity[] = []
let appliedTrails = 0

export function applyMemoryTrails(completedExpeditions: number): void {
  const target = Math.min(6, Math.floor(completedExpeditions / 2))
  while (trailEntities.length < target) {
    const t = engine.addEntity()
    Transform.create(t, {
      position: Vector3.create(
        TREE.position.x + Math.cos(trailEntities.length * 1.7) * 3.0,
        0.06,
        TREE.position.z + Math.sin(trailEntities.length * 1.7) * 3.0
      ),
      scale: Vector3.create(0.1, 0.1, 0.1)
    })
    MeshRenderer.setSphere(t)
    Material.setPbrMaterial(t, {
      emissiveColor: Color3.fromHexString('#9fd8ff'),
      emissiveIntensity: 1.2,
      albedoColor: Color4.fromHexString('#9fd8ff')
    })
    trailEntities.push(t)
  }
  trailEntities.forEach((e, i) => {
    const t = Transform.getMutable(e)
    t.scale.x = i < target ? 0.1 : 0.001
    t.scale.y = i < target ? 0.1 : 0.001
    t.scale.z = i < target ? 0.1 : 0.001
  })
  appliedTrails = target
}

export function trailCountApplied(): number {
  return appliedTrails
}

// --- rare memory seed (G5) --------------------------------------------------

// A golden glowing seed at today's deterministic rare location. Hidden once
// discovered; the world keeps a small "remembered" glow.
let rareSeed: Entity | null = null
let rareGlow: Entity | null = null

export function applyRareMemory(): void {
  const loc = livingRareLocation()
  const discovered = livingRareDiscovered()
  if (!loc) return

  if (rareSeed === null && !discovered) {
    const pos = FRAGMENT_LOCATIONS[loc as ExpeditionFragmentId]
    rareSeed = engine.addEntity()
    Transform.create(rareSeed, {
      position: Vector3.create(pos.x, 0.5, pos.z),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })
    MeshRenderer.setSphere(rareSeed)
    Material.setPbrMaterial(rareSeed, {
      emissiveColor: Color3.fromHexString('#ffd700'),
      emissiveIntensity: 3,
      albedoColor: Color4.fromHexString('#ffd700')
    })
  }
  if (rareSeed && discovered && engine.getEntityState(rareSeed) !== EntityState.Removed) {
    engine.removeEntity(rareSeed)
    rareSeed = null
    // a soft lingering glow marks where it was found
    if (rareGlow === null && loc) {
      const pos = FRAGMENT_LOCATIONS[loc as ExpeditionFragmentId]
      rareGlow = engine.addEntity()
      Transform.create(rareGlow, {
        position: Vector3.create(pos.x, 0.05, pos.z),
        scale: Vector3.create(0.5, 0.02, 0.5)
      })
      MeshRenderer.setCylinder(rareGlow, 1.4, 1.4)
      Material.setPbrMaterial(rareGlow, {
        emissiveColor: Color3.fromHexString('#ffd700'),
        emissiveIntensity: 0.8,
        albedoColor: Color4.fromHexString('#ffd70000')
      })
    }
  }
}

export function rareSeedEntityCount(): number {
  return (rareSeed ? 1 : 0) + (rareGlow ? 1 : 0)
}

export function resetWorldEvolution(): void {
  for (const e of levelRing) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  levelRing.length = 0
  appliedLevel = 0
  for (const e of trailEntities) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  trailEntities.length = 0
  appliedTrails = 0
  if (rareSeed && engine.getEntityState(rareSeed) !== EntityState.Removed) engine.removeEntity(rareSeed)
  rareSeed = null
  if (rareGlow && engine.getEntityState(rareGlow) !== EntityState.Removed) engine.removeEntity(rareGlow)
  rareGlow = null
}

// One entry point the scene calls when living-world state changes.
export function syncLivingWorld(): void {
  applyWorldLevel(livingMemoryLevel())
  applyLighthouseStage(livingLandmarkStage())
  applyMemoryTrails(livingCommunityActivity().completedExpeditions)
  applyRareMemory()
}
