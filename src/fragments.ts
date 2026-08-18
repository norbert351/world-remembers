// Memory Fragments and Echo Guardians. All primitives: no GLBs.
//
// Fragment: floating emissive crystal (two crossed thin boxes + core +
// 3 orbiting motes), gently bobbing. When collected the server confirms
// and the fragment dissolves into motes.
//
// Guardian: dark translucent sphere + emissive core + 2 orbiting motes.
// State machine: IDLE (fragment hidden) -> ACTIVE (fragment revealed, player
// nearby) -> DISPELLING (per hit) -> DISSOLVED (fragment collectible).
// The server counts hits; the client only renders what the server says.
import {
  engine,
  Entity,
  EntityState,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { fragmentLocation, type ExpeditionFragmentId } from '../shared/expedition'
import { collectFragment as collectFragmentAction, expeditionHits, expeditionIsCollected } from './expedition'

const MOTES = 3
const FRAGMENT_BOB = 0.35 // meters of bob
const FRAGMENT_BOB_SPEED = 1.2 // radians per second
const GUARDIAN_SWAY = 0.5

export interface FragmentRig {
  id: ExpeditionFragmentId
  root: Entity
  guardian: Entity | null // null once dissolved
  fragment: Entity | null // null while guarded or collected
  motes: Entity[]
  collected: boolean
  bobPhase: number
  pulsePhase: number
  // beacon: a subtle emissive pillar + ground ring so the site is
  // discoverable from across the world, not only within interaction range
  beacon: { pillar: Entity; ring: Entity } | null
  // last hit count we styled the guardian for, so we only re-skin on change
  lastShownHits: number
}

const rigs: FragmentRig[] = []

let identityFn: () => string | null = () => null
export function setFragmentIdentityResolver(fn: () => string | null): void {
  identityFn = fn
}

function makeMotes(parent: Entity, count: number, radius: number, color: Color3, y: number): Entity[] {
  const out: Entity[] = []
  for (let i = 0; i < count; i++) {
    const m = engine.addEntity()
    Transform.create(m, {
      parent,
      position: Vector3.create(radius, y, 0),
      scale: Vector3.create(0.06, 0.06, 0.06)
    })
    MeshRenderer.setSphere(m)
    Material.setPbrMaterial(m, {
      emissiveColor: color,
      emissiveIntensity: 2,
      albedoColor: Color4.fromHexString('#ffffff00')
    })
    out.push(m)
  }
  return out
}

// The location beacon: a tall slim emissive pillar rising from a wide soft
// ground ring. Easy to spot across the island, reads as "a memory waits
// here", mobile-friendly (two primitives, no colliders, no animations).
function makeBeacon(root: Entity): { pillar: Entity; ring: Entity } {
  const ring = engine.addEntity()
  Transform.create(ring, {
    parent: root,
    position: Vector3.create(0, 0.02, 0),
    scale: Vector3.create(1, 0.02, 1)
  })
  MeshRenderer.setCylinder(ring, 1.6, 1.6)
  Material.setPbrMaterial(ring, {
    emissiveColor: Color3.fromHexString('#9fd8ff'),
    emissiveIntensity: 0.9,
    albedoColor: Color4.fromHexString('#17304533')
  })

  const pillar = engine.addEntity()
  Transform.create(pillar, {
    parent: root,
    position: Vector3.create(0, 1.1, 0),
    scale: Vector3.create(1, 1, 1)
  })
  MeshRenderer.setCylinder(pillar, 0.06, 0.12)
  Material.setPbrMaterial(pillar, {
    emissiveColor: Color3.fromHexString('#9fd8ff'),
    emissiveIntensity: 1.4,
    albedoColor: Color4.fromHexString('#9fd8ff44')
  })

  return { pillar, ring }
}

// Create one expedition location: guardian + hidden fragment.
export function createExpeditionSite(id: ExpeditionFragmentId): FragmentRig {
  const loc = fragmentLocation(id) ?? { x: 0, z: 0 }
  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.create(loc.x, 0, loc.z) })

  // the guardian: dark floating orb
  const guardian = engine.addEntity()
  Transform.create(guardian, {
    parent: root,
    position: Vector3.create(0, 1.6, 0),
    scale: Vector3.create(0.8, 0.8, 0.8)
  })
  MeshRenderer.setSphere(guardian)
  Material.setPbrMaterial(guardian, {
    albedoColor: Color4.fromHexString('#1a1626cc'),
    emissiveColor: Color3.fromHexString('#2a2140'),
    emissiveIntensity: 0.6,
    transparencyMode: 2 // alpha blend
  })
  MeshCollider.setSphere(guardian)
  pointerEventsSystem.onPointerDown(
    {
      entity: guardian,
      opts: { button: InputAction.IA_POINTER, hoverText: 'DISPEL' }
    },
    () => {
      void collectFragmentAction(rigs.find((r) => r.id === id)?.id ?? id)
    }
  )

  // the guardian's core: small bright emissive rune
  const core = engine.addEntity()
  Transform.create(core, {
    parent: guardian,
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(0.22, 0.22, 0.22)
  })
  MeshRenderer.setBox(core)
  Material.setPbrMaterial(core, {
    emissiveColor: Color3.fromHexString('#ffd9a0'),
    emissiveIntensity: 3,
    albedoColor: Color4.fromHexString('#ffd9a0ff')
  })

  const guardianMotes = makeMotes(guardian, 2, 0.55, Color3.fromHexString('#9fd8ff'), 0.1)

  // the fragment: hidden until the guardian dissolves (scale 0)
  const fragment = engine.addEntity()
  Transform.create(fragment, {
    parent: root,
    position: Vector3.create(0, 1.1, 0),
    rotation: Quaternion.fromEulerDegrees(20, 0, 0),
    scale: Vector3.create(0.001, 0.001, 0.001)
  })
  // crystal: two crossed thin boxes, emissive
  const a = engine.addEntity()
  Transform.create(a, { parent: fragment, scale: Vector3.create(0.09, 0.5, 0.09) })
  MeshRenderer.setBox(a)
  Material.setPbrMaterial(a, {
    emissiveColor: Color3.fromHexString('#9fd8ff'),
    emissiveIntensity: 2.5,
    albedoColor: Color4.fromHexString('#9fd8ffdd')
  })
  const b = engine.addEntity()
  Transform.create(b, {
    parent: fragment,
    rotation: Quaternion.fromEulerDegrees(0, 90, 0),
    scale: Vector3.create(0.09, 0.5, 0.09)
  })
  MeshRenderer.setBox(b)
  Material.setPbrMaterial(b, {
    emissiveColor: Color3.fromHexString('#9fd8ff'),
    emissiveIntensity: 2.5,
    albedoColor: Color4.fromHexString('#9fd8ffdd')
  })
  const fragmentCore = engine.addEntity()
  Transform.create(fragmentCore, { parent: fragment, scale: Vector3.create(0.12, 0.12, 0.12) })
  MeshRenderer.setSphere(fragmentCore)
  Material.setPbrMaterial(fragmentCore, {
    emissiveColor: Color3.fromHexString('#ffffff'),
    emissiveIntensity: 3.5,
    albedoColor: Color4.fromHexString('#ffffff')
  })
  const fragmentMotes = makeMotes(fragment, MOTES, 0.5, Color3.fromHexString('#9fd8ff'), 0.05)
  pointerEventsSystem.onPointerDown(
    {
      entity: fragment,
      opts: { button: InputAction.IA_POINTER, hoverText: 'COLLECT MEMORY' }
    },
    () => {
      void collectFragmentAction(rigs.find((r) => r.id === id)?.id ?? id)
    }
  )

  const rig: FragmentRig = {
    id,
    root,
    guardian,
    fragment,
    motes: [...guardianMotes, ...fragmentMotes],
    collected: false,
    bobPhase: Math.random() * Math.PI * 2,
    pulsePhase: 0,
    beacon: null,
    lastShownHits: -1
  }
  // beacon present while the site is active (not collected); removed when
  // the fragment is collected
  rig.beacon = makeBeacon(root)
  rigs.push(rig)
  rig.lastShownHits = -1
  return rig
}

// A guardian's visual instability stage for a given hit count (pure, exported
// for tests). 0 = calm dark, 1..2 = heating up and turbulent, 3 = defeated but
// not yet dissolved (bright + shaking before the fragment is revealed).
export function guardianStageFor(hits: number): { c: string; i: number; s: number } {
  const stages: Record<number, { c: string; i: number; s: number }> = {
    0: { c: '#2a2140', i: 0.6, s: 1 },
    1: { c: '#8a4d2a', i: 1.2, s: 1.1 },
    2: { c: '#e0843c', i: 1.9, s: 1.06 },
    3: { c: '#ffc46b', i: 2.8, s: 1 }
  }
  return stages[Math.min(hits, 3)] ?? stages[0]
}

// Apply the escalation to a guardian's live material + scale. Runs each visual
// tick but early-returns when the hit count hasn't changed (cheap).
function styleGuardian(rig: FragmentRig): void {
  if (!rig.guardian) return
  const hits = expeditionHits(rig.id)
  if (hits === rig.lastShownHits) return
  rig.lastShownHits = hits
  const st = guardianStageFor(hits)
  const g = Transform.getMutable(rig.guardian)
  g.scale = Vector3.create(st.s, st.s, st.s)
  const mat = Material.getFlatMutable(rig.guardian)
  if (mat) {
    mat.emissiveColor = Color3.fromHexString(st.c)
    mat.emissiveIntensity = st.i
  }
}

// Sync all sites against server state. Called after load and after every
// server-confirmed action. Event-driven, cheap.
export function syncExpeditionSites(): void {
  for (const rig of rigs) {
    const collected = expeditionIsCollected(rig.id)
    const hits = expeditionHits(rig.id)
    const guardianCleared = hits >= 3

    // remove the beacon once the site is collected (or already was)
    if (collected && rig.beacon) {
      if (engine.getEntityState(rig.beacon.pillar) !== EntityState.Removed) engine.removeEntity(rig.beacon.pillar)
      if (engine.getEntityState(rig.beacon.ring) !== EntityState.Removed) engine.removeEntity(rig.beacon.ring)
      rig.beacon = null
    }

    if (collected !== rig.collected) {
      rig.collected = collected
      if (collected) {
        // dissolve guardian + fragment
        if (rig.guardian && engine.getEntityState(rig.guardian) !== EntityState.Removed) {
          engine.removeEntity(rig.guardian)
        }
        rig.guardian = null
        if (rig.fragment && engine.getEntityState(rig.fragment) !== EntityState.Removed) {
          engine.removeEntity(rig.fragment)
        }
        rig.fragment = null
      }
    } else if (guardianCleared && rig.fragment) {
      // guardian cleared: reveal the fragment
      const t = Transform.getMutable(rig.fragment)
      t.scale = Vector3.create(1, 1, 1)
    }
  }
}

// Gentle animation: fragment bobs and spins, guardian sways, motes orbit.
// One system, all rigs, cheap math.
export function expeditionVisualSystem(dt: number): void {
  for (const rig of rigs) {
    rig.bobPhase += dt * FRAGMENT_BOB_SPEED
    rig.pulsePhase += dt * 2.2

    if (rig.guardian) {
      styleGuardian(rig)
      const g = Transform.getMutable(rig.guardian)
      const sway = Math.sin(rig.bobPhase * 0.6) * GUARDIAN_SWAY
      g.position.y = 1.6 + sway * 0.25
      // motes orbit
      const gm = rig.motes.slice(0, 2)
      for (let i = 0; i < gm.length; i++) {
        const m = Transform.getMutable(gm[i])
        const ang = rig.bobPhase * 2 + (i * Math.PI) / 1
        m.position.x = Math.cos(ang) * 0.55
        m.position.z = Math.sin(ang) * 0.55
      }
    }

    if (rig.fragment) {
      const f = Transform.getMutable(rig.fragment)
      const bob = Math.sin(rig.bobPhase) * FRAGMENT_BOB
      f.position.y = 1.1 + bob
      f.rotation = Quaternion.fromEulerDegrees(20, (rig.bobPhase * 180) / Math.PI, 0)
      // fragment motes orbit
      const fm = rig.motes.slice(2)
      for (let i = 0; i < fm.length; i++) {
        const m = Transform.getMutable(fm[i])
        const ang = rig.bobPhase * 1.8 + (i * Math.PI * 2) / MOTES
        m.position.x = Math.cos(ang) * 0.5
        m.position.z = Math.sin(ang) * 0.5
        m.position.y = Math.sin(rig.bobPhase * 1.2 + i) * 0.15
      }
    }
  }
}

// Test helpers ----------------------------------------------------------------

export function expeditionSiteCount(): number {
  return rigs.length
}

export function resetExpeditionSites(): void {
  for (const rig of rigs) {
    if (engine.getEntityState(rig.root) !== EntityState.Removed) engine.removeEntity(rig.root)
  }
  rigs.length = 0
}
