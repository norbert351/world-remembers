// Phase E world composition: zone ground discs, extended spawn path, plaza
// border, benches, and glowing trail plants. Every object answers "why does
// this exist": zones give each area an identity, the path guides to the
// tree, benches invite rest, trails lead to the Memory Stones.
import {
  engine,
  Entity,
  Material,
  MeshCollider,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { BENCHES, PATH_EXT, PLAZA_BORDER, TRAILS, ZONES } from './config'

// Zone ground discs: a tinted ring underfoot so entering a new area reads
// without any UI. Emissive-free flat color, one entity per zone.
function createZoneDiscs(): void {
  const zones = [
    { pos: ZONES.garden.position, radius: ZONES.garden.radius, tint: ZONES.garden.tint },
    { pos: ZONES.stone.position, radius: ZONES.stone.radius, tint: ZONES.stone.tint }
  ]
  for (const z of zones) {
    const disc = engine.addEntity()
    Transform.create(disc, {
      position: Vector3.create(z.pos.x, 0.015, z.pos.z),
      scale: Vector3.create(1, 0.02, 1)
    })
    MeshRenderer.setCylinder(disc, z.radius, z.radius)
    Material.setPbrMaterial(disc, {
      albedoColor: z.tint,
      roughness: 1,
      metallic: 0
    })
  }
}

// Extended stepping stones from the spawn corner toward the plaza. The
// original three are kept; these three continue the line so the tree is
// the first visual destination.
function createPathExtension(): void {
  for (const spot of PATH_EXT) {
    const stone = engine.addEntity()
    Transform.create(stone, {
      position: Vector3.create(spot.x, 0.03, spot.z),
      scale: Vector3.create(1.6, 0.06, 1.6)
    })
    MeshRenderer.setBox(stone)
    MeshCollider.setBox(stone)
    Material.setPbrMaterial(stone, {
      albedoColor: { r: 0.71, g: 0.65, b: 0.56, a: 1 },
      roughness: 1,
      metallic: 0
    })
  }
}

// Low stone border around the plaza: ring of small segments, warm stone
// tone, no collider (decorative edge, walking over it is fine).
function createPlazaBorder(): void {
  const { radius, segments } = PLAZA_BORDER
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = 16 + Math.cos(a) * radius
    const z = 16 + Math.sin(a) * radius
    const seg = engine.addEntity()
    Transform.create(seg, {
      position: Vector3.create(x, 0.12, z),
      rotation: Quaternion.fromEulerDegrees(0, (-a * 180) / Math.PI, 0),
      scale: Vector3.create(0.9, 0.24, 0.5)
    })
    MeshRenderer.setBox(seg)
    Material.setPbrMaterial(seg, {
      albedoColor: { r: 0.66, g: 0.6, b: 0.52, a: 1 },
      roughness: 0.95,
      metallic: 0
    })
  }
}

// Two benches at the plaza edge. Seat + two legs, all primitive boxes,
// colliders on the seat so players can rest (and they read as intentional).
function createBench(x: number, z: number, rotation: number): void {
  const bench = engine.addEntity()
  Transform.create(bench, {
    position: Vector3.create(x, 0, z),
    rotation: Quaternion.fromEulerDegrees(0, rotation, 0)
  })
  // seat
  const seat = engine.addEntity()
  Transform.create(seat, {
    parent: bench,
    position: Vector3.create(0, 0.55, 0),
    scale: Vector3.create(1.5, 0.12, 0.5)
  })
  MeshRenderer.setBox(seat)
  MeshCollider.setBox(seat)
  Material.setPbrMaterial(seat, {
    albedoColor: { r: 0.42, g: 0.34, b: 0.26, a: 1 },
    roughness: 0.8,
    metallic: 0
  })
  // two legs
  for (const dz of [-0.18, 0.18]) {
    const leg = engine.addEntity()
    Transform.create(leg, {
      parent: bench,
      position: Vector3.create(0, 0.25, dz),
      scale: Vector3.create(0.14, 0.5, 0.14)
    })
    MeshRenderer.setBox(leg)
    MeshCollider.setBox(leg)
    Material.setPbrMaterial(leg, {
      albedoColor: { r: 0.3, g: 0.24, b: 0.18, a: 1 },
      roughness: 0.9,
      metallic: 0
    })
  }
}

// Glowing trail plants: small emissive buds on stems that lead the eye from
// the garden toward each Memory Stone. Environmental storytelling, no UI.
function createTrailPlants(): void {
  for (const spot of TRAILS) {
    const plant = engine.addEntity()
    Transform.create(plant, {
      position: Vector3.create(spot.x, 0, spot.z)
    })
    // stem
    const stem = engine.addEntity()
    Transform.create(stem, {
      parent: plant,
      position: Vector3.create(0, 0.18, 0),
      scale: Vector3.create(0.05, 0.36, 0.05)
    })
    MeshRenderer.setBox(stem)
    Material.setPbrMaterial(stem, {
      albedoColor: { r: 0.24, g: 0.32, b: 0.18, a: 1 },
      roughness: 1,
      metallic: 0
    })
    // glowing bud
    const bud = engine.addEntity()
    Transform.create(bud, {
      parent: plant,
      position: Vector3.create(0, 0.42, 0),
      scale: Vector3.create(0.14, 0.14, 0.14)
    })
    MeshRenderer.setSphere(bud)
    Material.setPbrMaterial(bud, {
      emissiveColor: { r: 0.6, g: 0.85, b: 1 },
      emissiveIntensity: 1.8,
      albedoColor: { r: 0.1, g: 0.2, b: 0.3, a: 1 }
    })
  }
}

export function setupWorldComposition(): void {
  createZoneDiscs()
  createPathExtension()
  createPlazaBorder()
  for (const b of BENCHES) {
    createBench(b.x, b.z, b.rotation)
  }
  createTrailPlants()
}

// exported for tests: entity count bookkeeping helpers
// each bench = root + seat + 2 legs = 4; each trail plant = root + stem + bud = 3
export function compositionEntityCount(): number {
  return 2 + PATH_EXT.length + PLAZA_BORDER.segments + BENCHES.length * 4 + TRAILS.length * 3
}

export { Entity }
