// Ritual visuals: the wave ring, the comet, stone responses, tree bloom.
// Everything is event-driven: entities are created when a phase begins and
// a tiny system animates them only while the ritual is active. Nothing runs
// per-frame outside the ritual.
import {
  engine,
  Entity,
  EntityState,
  Material,
  MeshRenderer,
  SkyboxTime,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Vector3 } from '@dcl/sdk/math'
import { RITUAL, STAGES, TREE } from './config'
import { ritualState, type RitualIntensity, type RitualPhase } from './ritual'
import { startStonePulse } from './stones'
import { applySkybox } from './tree'
import { STONES } from './config'
import { worldState } from './state'
import { stageIndexFor } from '../shared/world-state'

// wave ring: expands from the tree and fades
let waveEntity: Entity | null = null
let waveTime = 0
const WAVE_DURATION = RITUAL.response

// comet: an emissive sphere with a glowing trail
let cometHead: Entity | null = null
let cometTrail: Entity | null = null
let cometTime = 0
const COMET_DURATION = RITUAL.sky

// mote burst: a few tiny spheres rising from the tree heart
const burstMotes: Entity[] = []
let burstTime = 0
const BURST_DURATION = 1.6
const BURST_COUNT = 5

// stone response sequence: stones pulse one after another during 'response'
const STONE_STAGGER = 0.7

// skybox dim while the ritual runs, restored afterwards
const RITUAL_SKY = 69000 // late dusk: calm and quiet

function removeEntity(e: Entity | null): void {
  if (e !== null && engine.getEntityState(e) !== EntityState.Removed) {
    engine.removeEntity(e)
  }
}

export function cleanupRitualVisuals(): void {
  removeEntity(waveEntity)
  waveEntity = null
  removeEntity(cometHead)
  cometHead = null
  removeEntity(cometTrail)
  cometTrail = null
  for (const m of burstMotes) {
    if (engine.getEntityState(m) !== EntityState.Removed) engine.removeEntity(m)
  }
  burstMotes.length = 0
  // restore the stage skybox
  applySkybox(stageIndexNow())
}

function stageIndexNow(): number {
  return stageIndexFor(worldState.contributions)
}

function createWave(): void {
  waveEntity = engine.addEntity()
  Transform.create(waveEntity, {
    position: Vector3.create(TREE.position.x, 0.08, TREE.position.z),
    scale: Vector3.create(0.1, 0.03, 0.1)
  })
  MeshRenderer.setCylinder(waveEntity, 1, 1)
  Material.setPbrMaterial(waveEntity, {
    emissiveColor: Color3.fromHexString('#ffe08a'),
    emissiveIntensity: 2.2,
    albedoColor: { r: 1, g: 0.88, b: 0.54, a: 0.6 }
  })
  waveTime = 0
}

function createComet(): void {
  cometHead = engine.addEntity()
  Transform.create(cometHead, {
    position: Vector3.create(RITUAL.cometStart.x, RITUAL.cometStart.y, RITUAL.cometStart.z)
  })
  MeshRenderer.setSphere(cometHead)
  Material.setPbrMaterial(cometHead, {
    emissiveColor: Color3.fromHexString('#ffffff'),
    emissiveIntensity: 6
  })

  cometTrail = engine.addEntity()
  Transform.create(cometTrail, {
    position: Vector3.create(RITUAL.cometStart.x, RITUAL.cometStart.y, RITUAL.cometStart.z),
    scale: Vector3.create(2.6, 0.12, 0.12)
  })
  MeshRenderer.setBox(cometTrail)
  Material.setPbrMaterial(cometTrail, {
    emissiveColor: Color3.fromHexString('#bfe3ff'),
    emissiveIntensity: 3
  })
  cometTime = 0
}

function createMoteBurst(intensity: RitualIntensity): void {
  const count = BURST_COUNT + intensity
  for (let i = 0; i < count; i++) {
    const mote = engine.addEntity()
    const angle = Math.random() * Math.PI * 2
    const radius = 0.8 + Math.random() * 1.2
    Transform.create(mote, {
      position: Vector3.create(
        TREE.position.x + Math.cos(angle) * radius,
        0.5,
        TREE.position.z + Math.sin(angle) * radius
      ),
      scale: Vector3.create(0.07, 0.07, 0.07)
    })
    MeshRenderer.setSphere(mote)
    Material.setPbrMaterial(mote, {
      emissiveColor: Color3.fromHexString('#ffe9b0'),
      emissiveIntensity: 3.5
    })
    burstMotes.push(mote)
  }
  burstTime = 0
}

// called from the ritual hooks: respond to each phase
export function ritualPhaseVisual(phase: RitualPhase, intensity: RitualIntensity): void {
  switch (phase) {
    case 'quiet':
      // calmer sky: shift toward dusk
      const sky = SkyboxTime.getMutableOrNull(engine.RootEntity)
      if (sky) sky.fixedTime = RITUAL_SKY
      break
    case 'response':
      createWave()
      // stones respond one after another, brighter with higher intensity
      for (let i = 0; i < STONES.length; i++) {
        const delayMs = i * STONE_STAGGER * 1000
        setTimeout(() => {
          if (ritualState.active) startStonePulse()
        }, delayMs)
      }
      break
    case 'sky':
      createComet()
      createMoteBurst(intensity)
      break
    case 'complete':
      // handled by onComplete: cleanup + restore sky
      break
    case 'idle':
      break
  }
}

// system: animate the wave, comet and motes while they exist
export function ritualVisualSystem(dt: number): void {
  // wave ring expansion
  if (waveEntity) {
    waveTime += dt
    const k = Math.min(1, waveTime / WAVE_DURATION)
    const radius = 0.5 + (RITUAL.waveMaxRadius - 0.5) * easeOut(k)
    const t = Transform.getMutable(waveEntity)
    t.scale = Vector3.create(radius, 0.03, radius)
    const mat = Material.getFlatMutable(waveEntity)
    mat.emissiveIntensity = 2.2 * (1 - k)
    if (k >= 1) {
      removeEntity(waveEntity)
      waveEntity = null
    }
  }

  // comet travels start -> end
  if (cometHead) {
    cometTime += dt
    const k = Math.min(1, cometTime / COMET_DURATION)
    const sx = RITUAL.cometStart.x + (RITUAL.cometEnd.x - RITUAL.cometStart.x) * k
    const sy = RITUAL.cometStart.y + (RITUAL.cometEnd.y - RITUAL.cometStart.y) * k
    const sz = RITUAL.cometStart.z + (RITUAL.cometEnd.z - RITUAL.cometStart.z) * k
    const head = Transform.getMutable(cometHead)
    head.position = Vector3.create(sx, sy, sz)
    const trail = Transform.getMutable(cometTrail!)
    // trail points along the travel direction
    const dx = RITUAL.cometEnd.x - RITUAL.cometStart.x
    const dz = RITUAL.cometEnd.z - RITUAL.cometStart.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    trail.position = Vector3.create(sx - (dx / len) * 1.3, sy, sz - (dz / len) * 1.3)
    if (k >= 1) {
      removeEntity(cometHead)
      cometHead = null
      removeEntity(cometTrail)
      cometTrail = null
    }
  }

  // motes rise and fade
  if (burstMotes.length > 0) {
    burstTime += dt
    for (const mote of burstMotes) {
      const t = Transform.getMutable(mote)
      t.position = Vector3.create(t.position.x, t.position.y + dt * 0.7, t.position.z)
      const mat = Material.getFlatMutable(mote)
      mat.emissiveIntensity = Math.max(0, 3.5 * (1 - burstTime / BURST_DURATION))
    }
    if (burstTime >= BURST_DURATION) {
      for (const m of burstMotes) {
        if (engine.getEntityState(m) !== EntityState.Removed) engine.removeEntity(m)
      }
      burstMotes.length = 0
    }
  }
}

function easeOut(k: number): number {
  return 1 - Math.pow(1 - k, 3)
}
