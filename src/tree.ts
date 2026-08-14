// The Memory Tree: hero asset, growth states, contribution interaction.
// One GLB model. Growth is represented with lightweight visual state:
// emissive heart, floating motes, base flowers, warm heart light, skybox mood.
import {
  Animator,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  LightSource,
  Material,
  MeshRenderer,
  pointerEventsSystem,
  SkyboxTime,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'
import { PULSE, STAGES, TREE } from './config'
import { addContribution, stageFor, worldState } from './state'

export const heartEntity = engine.addEntity()
export const glowRingEntity = engine.addEntity()
const moteRig = engine.addEntity()
const moteEntities: Entity[] = []
const flowerEntities: Entity[] = []

// pulse state, active for PULSE.duration seconds after each contribution
let pulseTime = 0
let currentStage = -1

export function createMemoryTree(): Entity {
  const tree = engine.addEntity()
  Transform.create(tree, {
    position: Vector3.create(TREE.position.x, TREE.position.y, TREE.position.z),
    scale: Vector3.create(TREE.scale, TREE.scale, TREE.scale)
  })
  // validated: no _collider meshes in the GLB, interactive role -> mask 3
  GltfContainer.create(tree, {
    src: TREE.model,
    visibleMeshesCollisionMask: 3,
    invisibleMeshesCollisionMask: 0
  })
  // GLB has a sway animation; without Animator the engine loops the first clip silently
  Animator.create(tree, {
    states: [{ clip: TREE.clip, playing: true, loop: true }]
  })

  // mobile interaction: tap the tree to contribute
  pointerEventsSystem.onPointerDown(
    {
      entity: tree,
      opts: { button: InputAction.IA_POINTER, hoverText: 'HELP THE TREE GROW' }
    },
    () => {
      addContribution()
      startPulse()
    }
  )

  createHeart()
  createMotes()
  createGlowRing()
  createBloomRing()
  return tree
}

function createHeart(): void {
  Transform.create(heartEntity, {
    position: Vector3.create(TREE.heart.x, TREE.heart.y, TREE.heart.z)
  })
  MeshRenderer.setSphere(heartEntity)
  Material.setPbrMaterial(heartEntity, {
    emissiveColor: STAGES.heartColor[0],
    emissiveIntensity: STAGES.heartIntensity[0],
    albedoColor: { r: 0.1, g: 0.08, b: 0.05, a: 1 }
  })
}

function createMotes(): void {
  Transform.create(moteRig, {
    position: Vector3.create(TREE.heart.x, TREE.heart.y + 0.4, TREE.heart.z)
  })
  const count = STAGES.motesVisible[STAGES.motesVisible.length - 1]
  for (let i = 0; i < count; i++) {
    const mote = engine.addEntity()
    const angle = (i / count) * Math.PI * 2
    const radius = 1.9 + (i % 3) * 0.5
    const height = (i % 4) * 0.45 - 0.5
    Transform.create(mote, {
      parent: moteRig,
      position: Vector3.create(Math.cos(angle) * radius, height, Math.sin(angle) * radius),
      scale: Vector3.create(0.09, 0.09, 0.09)
    })
    MeshRenderer.setSphere(mote)
    Material.setPbrMaterial(mote, {
      emissiveColor: Color3.fromHexString('#ffe9b0'),
      emissiveIntensity: 3
    })
    moteEntities.push(mote)
  }
}

function createGlowRing(): void {
  Transform.create(glowRingEntity, {
    position: Vector3.create(TREE.position.x, 0.12, TREE.position.z),
    // unit-height cylinder: scale y gives the 5cm thickness
    scale: Vector3.create(0.9, 0.05, 0.9)
  })
  MeshRenderer.setCylinder(glowRingEntity, 2.4, 2.4)
  Material.setPbrMaterial(glowRingEntity, {
    emissiveColor: Color3.fromHexString('#ffe08a'),
    emissiveIntensity: 0.8
  })
}

// 16 daisies around the trunk; visible count grows with the tree stage
function createBloomRing(): void {
  const total = STAGES.flowersVisible[STAGES.flowersVisible.length - 1]
  for (let i = 0; i < total; i++) {
    const flower = engine.addEntity()
    const angle = (i / total) * Math.PI * 2
    Transform.create(flower, {
      position: Vector3.create(
        TREE.position.x + Math.cos(angle) * 2.6,
        0.05,
        TREE.position.z + Math.sin(angle) * 2.6
      ),
      rotation: Quaternion.fromEulerDegrees(0, (i / total) * 360, 0)
    })
    // validated: no _collider meshes, purely decorative -> mask 0
    GltfContainer.create(flower, {
      src: 'assets/Models/flower-daisy.glb',
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
    flowerEntities.push(flower)
  }
}

// Warm light at the tree heart. One light total in the scene (mobile safe).
export const heartLightEntity = engine.addEntity()

export function createHeartLight(): void {
  Transform.create(heartLightEntity, {
    position: Vector3.create(TREE.heart.x, TREE.heart.y - 1, TREE.heart.z)
  })
  LightSource.create(heartLightEntity, {
    type: LightSource.Type.Point({}),
    color: Color3.fromHexString('#ffb45e'),
    intensity: STAGES.lightIntensity[0]
  })
}

// The skybox mood: the world warms from dusk toward golden day as it remembers.
export function applySkybox(stage: number): void {
  const sky = SkyboxTime.getMutableOrNull(engine.RootEntity)
  if (sky) {
    sky.fixedTime = STAGES.skyTimes[stage]
  }
}

// Applies the world state to the tree visuals. Event-driven: only runs when
// the stage actually changes or the scene loads.
export function applyStage(stage: number): void {
  if (stage === currentStage) return
  currentStage = stage

  const heartMat = Material.getFlatMutable(heartEntity)
  heartMat.emissiveColor = STAGES.heartColor[stage]
  heartMat.emissiveIntensity = STAGES.heartIntensity[stage]

  const light = LightSource.getMutable(heartLightEntity)
  light.intensity = STAGES.lightIntensity[stage]

  applySkybox(stage)

  const flowers = STAGES.flowersVisible[stage]
  flowerEntities.forEach((f, i) => {
    const s = i < flowers ? 1 : 0.001
    Transform.getMutable(f).scale = Vector3.create(s, s, s)
  })

  const motes = STAGES.motesVisible[stage]
  moteEntities.forEach((m, i) => {
    const s = i < motes ? 0.09 : 0.001
    Transform.getMutable(m).scale = Vector3.create(s, s, s)
  })
}

export function startPulse(): void {
  pulseTime = PULSE.duration
}

// Two tiny systems: one drives the contribution pulse (idle when not active),
// one slowly orbits the motes. No per-frame polling of anything else.
export function pulseSystem(dt: number): void {
  if (pulseTime <= 0) return
  pulseTime -= dt
  const k = Math.max(0, pulseTime) / PULSE.duration
  const wave = Math.sin(k * Math.PI)
  const s = 1 + (PULSE.heartScalePeak - 1) * wave
  Transform.getMutable(heartEntity).scale = Vector3.create(s, s, s)
  const rs = 0.9 + 1.0 * wave
  Transform.getMutable(glowRingEntity).scale = Vector3.create(rs, 0.05, rs)
  const mat = Material.getFlatMutable(heartEntity)
  mat.emissiveIntensity = STAGES.heartIntensity[currentStage] + PULSE.emissiveFlash * wave
}

export function moteOrbitSystem(dt: number): void {
  const t = Transform.getMutable(moteRig)
  t.rotation = Quaternion.multiply(t.rotation, Quaternion.fromAngleAxis(dt * 0.25, Vector3.Up()))
}

export function applyCurrentStage(): void {
  applyStage(stageFor(worldState.contributions))
}
