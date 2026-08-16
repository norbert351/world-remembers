// The Memory Lighthouse: the community landmark. One persistent structure,
// built from primitives, evolving with the landmark stage (derived from
// completed expeditions). Stage 1 foundation -> 5 glowing beacon.
// Visible from most of the island, no realtime lights, all emissive.
import {
  engine,
  Entity,
  EntityState,
  Material,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { LIGHTHOUSE } from './config'

// per-stage visual knobs: what to show and how bright
const STAGE_BRIGHTNESS: Record<number, { beam: boolean; lantern: boolean; tower: boolean; glow: number }> = {
  1: { beam: false, lantern: false, tower: false, glow: 0.15 },
  2: { beam: false, lantern: false, tower: true, glow: 0.3 },
  3: { beam: false, lantern: true, tower: true, glow: 0.5 },
  4: { beam: true, lantern: true, tower: true, glow: 0.8 },
  5: { beam: true, lantern: true, tower: true, glow: 1.4 }
}

const towerParts: Entity[] = []
let lanternEntity: Entity | null = null
let beamEntity: Entity | null = null
let glowDiscEntity: Entity | null = null
let appliedStage = 0

export function setupLighthouse(): void {
  const base = engine.addEntity()
  Transform.create(base, {
    position: Vector3.create(LIGHTHOUSE.position.x, 0.02, LIGHTHOUSE.position.z)
  })

  // foundation ring (always present)
  const ring = engine.addEntity()
  Transform.create(ring, {
    parent: base,
    position: Vector3.create(0, 0.1, 0),
    scale: Vector3.create(1, 0.06, 1)
  })
  MeshRenderer.setCylinder(ring, 2.2, 2.2)
  Material.setPbrMaterial(ring, {
    albedoColor: Color4.fromHexString('#5a5248'),
    roughness: 0.9
  })
  towerParts.push(ring)

  // tower: three stacked cylinders (dormant -> stone; stage 2+ visible)
  for (let i = 0; i < 3; i++) {
    const seg = engine.addEntity()
    Transform.create(seg, {
      parent: base,
      position: Vector3.create(0, 0.9 + i * 0.9, 0),
      scale: Vector3.create(1 - i * 0.18, 1.8, 1 - i * 0.18)
    })
    MeshRenderer.setCylinder(seg, 1.1, 1.4)
    Material.setPbrMaterial(seg, {
      albedoColor: Color4.fromHexString('#6b6257'),
      roughness: 0.85
    })
    towerParts.push(seg)
  }

  // lantern: emissive warm sphere at the top (stage 3+)
  lanternEntity = engine.addEntity()
  Transform.create(lanternEntity, {
    parent: base,
    position: Vector3.create(0, 3.7, 0),
    scale: Vector3.create(0.35, 0.35, 0.35)
  })
  MeshRenderer.setSphere(lanternEntity)
  Material.setPbrMaterial(lanternEntity, {
    emissiveColor: Color3.fromHexString('#ffd27a'),
    emissiveIntensity: 1.2,
    albedoColor: Color4.fromHexString('#ffd27a')
  })

  // beam: a long thin emissive box pointing skyward (stage 4+)
  beamEntity = engine.addEntity()
  Transform.create(beamEntity, {
    parent: base,
    position: Vector3.create(0, 6.4, 0),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0),
    scale: Vector3.create(0.5, 5.4, 0.5)
  })
  MeshRenderer.setBox(beamEntity)
  Material.setPbrMaterial(beamEntity, {
    emissiveColor: Color3.fromHexString('#ffe9b0'),
    emissiveIntensity: 0.9,
    albedoColor: Color4.fromHexString('#ffe9b022')
  })

  // glow disc at the base (brightens with stage)
  glowDiscEntity = engine.addEntity()
  Transform.create(glowDiscEntity, {
    parent: base,
    position: Vector3.create(0, 0.03, 0),
    scale: Vector3.create(1, 0.02, 1)
  })
  MeshRenderer.setCylinder(glowDiscEntity, 3.2, 3.2)
  Material.setPbrMaterial(glowDiscEntity, {
    emissiveColor: Color3.fromHexString('#ffd27a'),
    emissiveIntensity: 0.2,
    albedoColor: Color4.fromHexString('#ffd27a00')
  })

  applyLighthouseStage(1)
}

// Apply the current landmark stage: show/hide tower, lantern, beam, glow.
// Event-driven: called when the living-world state loads or changes.
export function applyLighthouseStage(stage: number): void {
  const knobs = STAGE_BRIGHTNESS[stage] ?? STAGE_BRIGHTNESS[1]
  appliedStage = stage

  // tower segments appear from stage 2; hide by scaling to zero
  towerParts.forEach((e, i) => {
    const t = Transform.getMutable(e)
    const show = stage >= 2
    // foundation ring always visible; tower segments only stage 2+
    t.scale.y = i === 0 ? 0.06 : show ? 1.8 : 0.001
  })

  if (lanternEntity) {
    const t = Transform.getMutable(lanternEntity)
    t.scale.x = knobs.lantern ? 0.35 : 0.001
    t.scale.y = knobs.lantern ? 0.35 : 0.001
    t.scale.z = knobs.lantern ? 0.35 : 0.001
    const m = Material.getFlatMutable(lanternEntity)
    m.emissiveIntensity = knobs.lantern ? 1.2 + knobs.glow : 0.1
  }

  if (beamEntity) {
    const t = Transform.getMutable(beamEntity)
    t.scale.y = knobs.beam ? 5.4 : 0.001
    const m = Material.getFlatMutable(beamEntity)
    m.emissiveIntensity = knobs.beam ? 0.9 + knobs.glow * 0.8 : 0.1
  }

  if (glowDiscEntity) {
    const m = Material.getFlatMutable(glowDiscEntity)
    m.emissiveIntensity = 0.2 + knobs.glow
  }
}

export function lighthouseStageApplied(): number {
  return appliedStage
}

export function lighthouseEntityCount(): number {
  // base + ring + 3 tower segments + lantern + beam + glow = 7
  return 7
}

export function resetLighthouse(): void {
  for (const e of towerParts) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  towerParts.length = 0
  for (const e of [lanternEntity, beamEntity, glowDiscEntity]) {
    if (e && engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  lanternEntity = null
  beamEntity = null
  glowDiscEntity = null
  appliedStage = 0
}
