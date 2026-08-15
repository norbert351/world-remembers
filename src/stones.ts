// Memory Stones: the persistent visitor record. Three primitive-built stones
// placed around the garden, each with an emissive rune, a glow ring, a
// floating count label and three orbiting motes. Tap a stone to open its
// memory UI.
//
// Primitive-built on purpose: no new GLB to validate, cheap to render, and
// visually distinct from the boulders (dark smooth stone vs gray rock pile).
import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Quaternion, Vector3 } from '@dcl/sdk/math'
import { STONES } from './config'
import { selectStone, stoneState } from './stone-state'
import { isStoneId } from '../shared/stones'

// per-stone pulse state, active for STONE_PULSE seconds after a confirmed save
const STONE_PULSE = 1.1
let stonePulseTime = 0

// one rig per stone holding its motes, so a single system can orbit them
const moteRigs: Entity[] = []

export function setupStones(): void {
  for (const def of STONES) {
    createStone(def)
  }
}

function createStone(def: (typeof STONES)[number]): void {
  const stone = engine.addEntity()
  Transform.create(stone, {
    position: Vector3.create(def.position.x, def.position.y, def.position.z),
    rotation: Quaternion.fromEulerDegrees(0, def.rotation, 0)
  })

  // body: smooth dark sphere, clearly not a garden rock
  const body = engine.addEntity()
  Transform.create(body, {
    parent: stone,
    position: Vector3.create(0, 0.42, 0),
    scale: Vector3.create(0.55, 0.5, 0.55)
  })
  MeshRenderer.setSphere(body)
  MeshCollider.setSphere(body)
  Material.setPbrMaterial(body, {
    albedoColor: { r: 0.1, g: 0.1, b: 0.12, a: 1 },
    roughness: 0.3,
    metallic: 0.4,
    emissiveColor: Color3.fromHexString('#2a2e3a'),
    emissiveIntensity: 0.15
  })

  // engraved rune: a flat emissive slab on the front face
  const rune = engine.addEntity()
  Transform.create(rune, {
    parent: stone,
    position: Vector3.create(0, 0.5, 0.31),
    scale: Vector3.create(0.26, 0.12, 0.02)
  })
  MeshRenderer.setBox(rune)
  Material.setPbrMaterial(rune, {
    emissiveColor: def.runeColor,
    emissiveIntensity: 1.6
  })

  // glow ring at the base: the "this stone remembers" halo
  const ring = engine.addEntity()
  Transform.create(ring, {
    parent: stone,
    position: Vector3.create(0, 0.04, 0),
    scale: Vector3.create(0.75, 0.04, 0.75)
  })
  MeshRenderer.setCylinder(ring, 1, 1)
  Material.setPbrMaterial(ring, {
    emissiveColor: def.runeColor,
    emissiveIntensity: 0.7
  })

  // count label: billboarded TextShape above the stone
  const label = engine.addEntity()
  Transform.create(label, {
    parent: stone,
    position: Vector3.create(0, 1.15, 0)
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_ALL })
  TextShape.create(label, {
    text: '',
    fontSize: 3,
    textColor: { r: 1, g: 0.88, b: 0.54, a: 1 },
    outlineWidth: 0.15,
    outlineColor: { r: 0.05, g: 0.05, b: 0.08 }
  })

  // motes: three tiny emissive sparks orbiting the stone (reuse tree pattern)
  const rig = engine.addEntity()
  Transform.create(rig, {
    parent: stone,
    position: Vector3.create(0, 0.7, 0)
  })
  moteRigs.push(rig)
  for (let i = 0; i < 3; i++) {
    const mote = engine.addEntity()
    const angle = (i / 3) * Math.PI * 2
    Transform.create(mote, {
      parent: rig,
      position: Vector3.create(Math.cos(angle) * 0.55, 0.15, Math.sin(angle) * 0.55),
      scale: Vector3.create(0.05, 0.05, 0.05)
    })
    MeshRenderer.setSphere(mote)
    Material.setPbrMaterial(mote, {
      emissiveColor: def.runeColor,
      emissiveIntensity: 3
    })
  }

  // mobile-first interaction: tap the stone to open its memory UI
  pointerEventsSystem.onPointerDown(
    {
      entity: body,
      opts: { button: InputAction.IA_POINTER, hoverText: 'READ THE STONE' }
    },
    () => {
      selectStone(def.id)
    }
  )
}

// Event-driven label refresh: called when the stone list loads or a save is
// confirmed. Never per-frame.
export function refreshStoneLabels(): void {
  for (const [entity] of engine.getEntitiesWith(TextShape)) {
    const stoneId = stoneIdOf(entity)
    if (!stoneId) continue
    const summary = stoneState.stones.find((s) => s.id === stoneId)
    const count = summary?.memoryCount ?? 0
    const label = TextShape.getMutable(entity)
    label.text = count === 0 ? '' : `${count} ${count === 1 ? 'MEMORY' : 'MEMORIES'}`
  }
}

// Start the post-save pulse. Called only after the API confirms the write.
export function startStonePulse(): void {
  stonePulseTime = STONE_PULSE
}

// Tiny system: drives the success pulse on the selected stone (idle when not
// active) and slowly orbits all stone mote rigs.
export function stonePulseSystem(dt: number): void {
  if (stonePulseTime > 0) {
    stonePulseTime -= dt
    const k = Math.max(0, stonePulseTime) / STONE_PULSE
    const wave = Math.sin(k * Math.PI)
    // brighten the selected stone's rune + ring
    const selected = stoneState.selected
    for (const [entity] of engine.getEntitiesWith(MeshRenderer)) {
      const parent = Transform.getOrNull(entity)?.parent
      if (!parent) continue
      const stoneId = stoneIdOf(entity)
      if (!stoneId || stoneId !== selected) continue
      const mat = Material.getFlatMutable(entity)
      mat.emissiveIntensity = (mat.emissiveIntensity ?? 0) + 2.5 * wave
    }
  }
  for (const rig of moteRigs) {
    const t = Transform.getMutable(rig)
    t.rotation = Quaternion.multiply(t.rotation, Quaternion.fromAngleAxis(dt * 0.6, Vector3.Up()))
  }
}

// Resolve which configured stone a scene entity belongs to, by matching the
// entity's transform chain against the stone placements.
export function stoneIdOf(entity: Entity): string | null {
  let t = Transform.getOrNull(entity)
  if (!t) return null
  // walk up to the stone root (an entity whose position matches a placement)
  for (let depth = 0; depth < 4 && t; depth++) {
    for (const def of STONES) {
      if (Math.abs(t.position.x - def.position.x) < 0.01 && Math.abs(t.position.z - def.position.z) < 0.01) {
        return def.id
      }
    }
    t = t.parent ? Transform.getOrNull(t.parent) : null
  }
  return null
}

// exported for tests: verify every configured stone id is a valid shared id
export function validateStoneConfig(): boolean {
  return STONES.every((s) => isStoneId(s.id))
}
