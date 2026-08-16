// The restoration ritual: when a player returns all fragments to the tree,
// the world visibly responds. Fragments fly to the tree, the tree pulses,
// a light wave travels outward, flowers bloom, the sky shifts briefly.
// Works for a solo player; any player in the world sees it.
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
import { STAGES, TREE } from './config'
import { startPulse } from './tree'
import { applyRestoredGarden, playRestoredBloom } from './mission-complete'

// --- sky shift --------------------------------------------------------------

let skyShiftTime = 0
const SKY_SHIFT_DURATION = 4
const skyBaseTime = STAGES.skyTimes[0]
const skyRitualTime = 20 // dusk: golden, then returns

// --- flying fragments -------------------------------------------------------

interface FlyingFragment {
  entity: Entity
  from: { x: number; z: number }
  t: number
  done: boolean
}

const flyers: FlyingFragment[] = []
let flyTime = 0
const FLY_DURATION = 2.8

// Call when the server confirms expedition completion (with positions) or
// when the daily Memory Pulse fires (no positions: wave + sky only).
// Idempotent.
export function startRestoration(positions: { x: number; z: number }[]): void {
  skyShiftTime = SKY_SHIFT_DURATION
  flyTime = 0
  // clear any previous flyers
  for (const f of flyers) {
    if (engine.getEntityState(f.entity) !== EntityState.Removed) engine.removeEntity(f.entity)
  }
  flyers.length = 0
  for (const p of positions) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(p.x, 2.2, p.z),
      scale: Vector3.create(0.3, 0.3, 0.3)
    })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      emissiveColor: Color3.fromHexString('#9fd8ff'),
      emissiveIntensity: 3,
      albedoColor: Color4.fromHexString('#9fd8ffdd')
    })
    flyers.push({ entity: e, from: p, t: 0, done: false })
  }
  if (positions.length === 0) {
    // daily pulse: no fragments to fly, fire the wave immediately
    waveRequested = true
  }
  // the payoff starts once the fragments arrive (or immediately above)
}

// One system: flies the fragments to the tree heart, then pulses, blooms,
// waves and restores the sky.
export function restorationSystem(dt: number): void {
  if (skyShiftTime > 0) {
    skyShiftTime -= dt
    const k = Math.min(1, Math.max(0, (SKY_SHIFT_DURATION - skyShiftTime) / SKY_SHIFT_DURATION))
    // gentle dusk shift, back to stage color
    const shift = Math.sin(Math.min(1, k) * Math.PI)
    SkyboxTime.getMutable(engine.RootEntity).fixedTime = skyBaseTime + (skyRitualTime - skyBaseTime) * shift
  }

  if (flyers.length === 0) return
  flyTime += dt
  const k = Math.min(1, flyTime / FLY_DURATION)
  const arrived = k >= 1

  for (const f of flyers) {
    if (f.done) continue
    const t = Transform.getMutable(f.entity)
    const eased = 1 - Math.pow(1 - k, 3)
    t.position.x = f.from.x + (TREE.position.x - f.from.x) * eased
    t.position.z = f.from.z + (TREE.position.z - f.from.z) * eased
    t.position.y = 2.2 + Math.sin(eased * Math.PI) * 3.4
    t.scale.x = 0.3 * (1 - eased * 0.4)
    t.scale.y = 0.3 * (1 - eased * 0.4)
    t.scale.z = 0.3 * (1 - eased * 0.4)
  }

  if (arrived && !flyers[0].done) {
    for (const f of flyers) {
      f.done = true
      if (engine.getEntityState(f.entity) !== EntityState.Removed) engine.removeEntity(f.entity)
    }
    // the world responds: pulse, bloom, wave, celebration
    startPulse()
    applyRestoredGarden()
    playRestoredBloom()
    // wave ring via the ritual visuals module
    waveRequested = true
    flyers.length = 0
  }
}

// wave ring: a flat emissive ring expanding from the tree (same visual
// language as the Memory Moment)
let waveRequested = false
let waveEntity: Entity | null = null
let waveTime = 0
const WAVE_DURATION = 1.8

export function restorationWaveSystem(dt: number): void {
  if (waveRequested && waveEntity === null) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(TREE.position.x, 0.04, TREE.position.z),
      scale: Vector3.create(0.2, 0.02, 0.2)
    })
    MeshRenderer.setCylinder(e, 1, 1)
    Material.setPbrMaterial(e, {
      emissiveColor: Color3.fromHexString('#ffe08a'),
      emissiveIntensity: 1.6,
      albedoColor: Color4.fromHexString('#ffe08a00')
    })
    waveEntity = e
    waveTime = 0
    waveRequested = false
  }
  if (waveEntity === null) return
  waveTime += dt
  const k = Math.min(1, waveTime / WAVE_DURATION)
  const t = Transform.getMutable(waveEntity)
  const r = 0.2 + k * 15
  t.scale.x = r
  t.scale.z = r
  // fade out as it expands
  const mat = Material.getFlatMutable(waveEntity)
  mat.emissiveIntensity = 1.6 * (1 - k)
  if (k >= 1) {
    if (engine.getEntityState(waveEntity) !== EntityState.Removed) engine.removeEntity(waveEntity)
    waveEntity = null
  }
}

export function resetRestoration(): void {
  skyShiftTime = 0
  for (const f of flyers) {
    if (engine.getEntityState(f.entity) !== EntityState.Removed) engine.removeEntity(f.entity)
  }
  flyers.length = 0
  waveRequested = false
  if (waveEntity && engine.getEntityState(waveEntity) !== EntityState.Removed) engine.removeEntity(waveEntity)
  waveEntity = null
}
