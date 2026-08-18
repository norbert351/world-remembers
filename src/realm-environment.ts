// Memory Realm environments. Each realm is a visually distinct, primitive-only
// region so "I am somewhere else" reads instantly without heavy assets. Light,
// event-driven, mobile-friendly: a ground mood disc, an entry landmark, a
// midpoint landmark, a final shrine, and a scatter of themed props along the
// journey path. No GLBs, no colliders beyond a couple, shared emissive mats.
import {
  engine,
  Entity,
  EntityState,
  Material,
  MeshCollider,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type { RealmDefinition } from '../shared/realms'
import { realmWorld } from '../shared/realms'

let rigs: Entity[] = []
let builtFor = ''

// --- primitive helpers ------------------------------------------------------

function disc(world: { x: number; z: number }, radius: number, color: Color4, y = 0.02): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(world.x, y, world.z), scale: Vector3.create(1, 0.02, 1) })
  MeshRenderer.setCylinder(e, radius, radius)
  Material.setPbrMaterial(e, { albedoColor: color, roughness: 1, metallic: 0 })
  rigs.push(e)
  return e
}

function box(
  world: { x: number; z: number },
  scale: { x: number; y: number; z: number },
  color: Color4,
  rotY = 0,
  y = 0,
  emissive: Color3 | undefined = undefined,
  intensity = 0
): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(world.x, y, world.z),
    rotation: Quaternion.fromEulerDegrees(0, rotY, 0),
    scale: Vector3.create(scale.x, scale.y, scale.z)
  })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    ...(emissive ? { emissiveColor: emissive, emissiveIntensity: intensity } : {})
  })
  rigs.push(e)
  return e
}

function sphere(world: { x: number; z: number }, r: number, color: Color4, y = 0, emissive: Color3 | undefined = undefined, intensity = 0): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(world.x, y, world.z), scale: Vector3.create(r, r, r) })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    ...(emissive ? { emissiveColor: emissive, emissiveIntensity: intensity } : {})
  })
  rigs.push(e)
  return e
}

function column(world: { x: number; z: number }, h: number): void {
  box(world, { x: 1.1, y: h, z: 1.1 }, Color4.fromHexString('#b9aa8f'), 0, h / 2)
  box({ x: world.x, z: world.z }, { x: 1.6, y: 0.5, z: 1.6 }, Color4.fromHexString('#cdbea3'), 0, h + 0.25)
}

function standingStone(world: { x: number; z: number }, s: number, color: Color3, intensity: number): void {
  const s1 = sphere(world, s, Color4.fromHexString('#1a2330cc'), s * 0.6, color, intensity)
  const s2 = sphere({ x: world.x + 0.7, z: world.z + 0.3 }, s * 0.6, Color4.fromHexString('#1a2330aa'), s * 0.4, color, intensity * 0.8)
  const s3 = sphere({ x: world.x - 0.6, z: world.z - 0.4 }, s * 0.5, Color4.fromHexString('#1a2330aa'), s * 0.35, color, intensity * 0.8)
  void s1
  void s2
  void s3
}

function trunk(world: { x: number; z: number }, s: number): void {
  box(world, { x: 0.5, y: s * 2.4, z: 0.5 }, Color4.fromHexString('#3a3226'), 0, s)
  sphere({ x: world.x, z: world.z }, s * 1.6, Color4.fromHexString('#1d3a22'), s * 2.2)
}

// --- per-realm themes -------------------------------------------------------

function buildForest(r: RealmDefinition): void {
  const o = r.origin
  // mood ground
  disc({ x: o.x + 24, z: o.z + 24 }, 26, Color4.fromHexString('#10281ccc'))
  // trees along the journey
  for (const p of r.objectives) {
    trunk({ x: o.x + p.local.x + 4, z: o.z + p.local.z }, 1.2 + ((p.local.x + p.local.z) % 3) * 0.2)
    trunk({ x: o.x + p.local.x - 3, z: o.z + p.local.z - 3 }, 0.9)
  }
  // glowing mushrooms as breadcrumbs
  const spots = [r.entry.local, r.objectives[0].local, r.mid.local, r.objectives[1].local, r.objectives[2].local, r.shrine.local]
  spots.forEach((s, i) => {
    const w = { x: o.x + s.x + 1.5, z: o.z + s.z }
    if (i % 2 === 0) sphere(w, 0.3, Color4.fromHexString('#9fd8ff22'), 0.15, Color3.fromHexString('#8fe3c0'), 1.6)
  })
  // mid landmark: the glowing tree
  const mid = { x: o.x + r.mid.local.x, z: o.z + r.mid.local.z }
  trunk(mid, 2)
  sphere({ x: mid.x + 1.2, z: mid.z }, 0.4, Color4.fromHexString('#1a233000'), 2.4, Color3.fromHexString('#8fe3c0'), 2.2)
}

function buildRuins(r: RealmDefinition): void {
  const o = r.origin
  disc({ x: o.x + 24, z: o.z + 24 }, 26, Color4.fromHexString('#2a2118cc'))
  // broken columns along the journey
  r.objectives.forEach((p, i) => {
    column({ x: o.x + p.local.x + 3, z: o.z + p.local.z }, 3 + i)
    column({ x: o.x + p.local.x - 2, z: o.z + p.local.z - 2 }, 2 + i * 0.5)
  })
  // amber memory crystals as breadcrumbs
  const spots = [r.entry.local, r.objectives[0].local, r.mid.local, r.objectives[1].local, r.objectives[2].local]
  spots.forEach((s, i) => {
    if (i % 2 === 0) {
      const w = { x: o.x + s.x, z: o.z + s.z + 1 }
      box(w, { x: 0.3, y: 0.9, z: 0.3 }, Color4.fromHexString('#ffd9a044'), 45, 0.45, Color3.fromHexString('#ffc27a'), 1.8)
    }
  })
  // mid landmark: fallen courtyard (flat broken plinth)
  const mid = { x: o.x + r.mid.local.x, z: o.z + r.mid.local.z }
  box(mid, { x: 3.4, y: 0.4, z: 3.4 }, Color4.fromHexString('#c9b998'), 0, 0.2)
}

function buildStarfall(r: RealmDefinition): void {
  const o = r.origin
  disc({ x: o.x + 24, z: o.z + 24 }, 26, Color4.fromHexString('#0c1230cc'))
  // floating islands + light pools along the journey
  r.objectives.forEach((p, i) => {
    const w = { x: o.x + p.local.x, z: o.z + p.local.z }
    // floating disc with a light pillar
    const fy = 30 + i * 14
    const discE = box({ x: w.x, z: w.z }, { x: 2.6, y: 0.5, z: 2.6 }, Color4.fromHexString('#3a4a7a'), 0, fy)
    const pillar = box({ x: w.x, z: w.z }, { x: 0.2, y: fy + 6, z: 0.2 }, Color4.fromHexString('#1a233000'), 0, 0, Color3.fromHexString('#9fd8ff'), 1.6)
    void discE
    void pillar
    // ground light pool below
    sphere({ x: w.x, z: w.z }, 0.5, Color4.fromHexString('#1a233000'), 0.3, Color3.fromHexString('#9fd8ff'), 1.4)
  })
  // floating monolith mid landmark
  const mid = { x: o.x + r.mid.local.x, z: o.z + r.mid.local.z }
  box({ x: mid.x, z: mid.z }, { x: 1.2, y: 10, z: 1.2 }, Color4.fromHexString('#4a5a9a'), 15, 5, Color3.fromHexString('#7a9aff'), 0.8)
}

// --- shrine (shared) --------------------------------------------------------

function buildShrine(r: RealmDefinition): void {
  const sh = { x: r.origin.x + r.shrine.local.x, z: r.origin.z + r.shrine.local.z }
  disc(sh, 4.5, Color4.fromHexString('#1a233033'))
  // glowing memory altar
  box(sh, { x: 1.4, y: 0.6, z: 1.4 }, Color4.fromHexString('#3a3244'), 0, 0.3, Color3.fromHexString('#ffe08a'), 1.6)
  sphere({ x: sh.x, z: sh.z }, 0.5, Color4.fromHexString('#1a233000'), 1.6, Color3.fromHexString('#ffe08a'), 3)
  // small marker boulders flanking it
  for (const dz of [-2.2, 2.2]) {
    sphere({ x: sh.x + 2, z: sh.z + dz }, 0.5, Color4.fromHexString('#4a4355'))
  }
  // the return marker sits beside the shrine
  const out = { x: r.origin.x + r.portalOut.local.x, z: r.origin.z + r.portalOut.local.z }
  sphere(out, 0.5, Color4.fromHexString('#1a2330cc'), 1.0, Color3.fromHexString('#9fd8ff'), 2.4)
}

// Build one realm's environment. Idempotent per realm id.
export function buildRealmEnvironment(realm: RealmDefinition): void {
  if (builtFor === realm.id) return
  resetRealmEnvironment()
  builtFor = realm.id
  if (realm.id === 'forgotten_forest') buildForest(realm)
  else if (realm.id === 'lost_ruins') buildRuins(realm)
  else if (realm.id === 'starfall_island') buildStarfall(realm)
  buildShrine(realm)
}

export function resetRealmEnvironment(): void {
  for (const e of rigs) {
    if (engine.getEntityState(e) !== EntityState.Removed) engine.removeEntity(e)
  }
  rigs.length = 0
  builtFor = ''
}

export function realmEnvironmentEntityCount(): number {
  return rigs.length
}
