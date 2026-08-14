// The garden: ground, plaza, path, lanterns, and the small verified props.
// All placements were computed from validated GLB bounding boxes.
import {
  Animator,
  engine,
  Entity,
  GltfContainer,
  Material,
  MeshCollider,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { COLORS, TREE } from './config'

// Ground: one box covering all 4 parcels (32x32), collision included.
function createGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(16, -0.1, 16),
    scale: Vector3.create(32, 0.2, 32)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, {
    albedoColor: COLORS.ground,
    roughness: 1,
    metallic: 0
  })
}

// Plaza: a low cylinder under the tree, the social heart of the scene.
function createPlaza(): void {
  const plaza = engine.addEntity()
  Transform.create(plaza, {
    position: Vector3.create(16, 0.01, 16),
    scale: Vector3.create(1, 0.14, 1)
  })
  MeshRenderer.setCylinder(plaza, 8.5, 8.5)
  MeshCollider.setCylinder(plaza, 8.5, 8.5)
  Material.setPbrMaterial(plaza, {
    albedoColor: COLORS.plaza,
    roughness: 0.9,
    metallic: 0
  })
}

// Stepping stones from the spawn corner toward the plaza.
function createPath(): void {
  const spots = [
    { x: 9.5, z: 9.5 },
    { x: 12, z: 12 },
    { x: 14.5, z: 14.5 }
  ]
  for (const spot of spots) {
    const stone = engine.addEntity()
    Transform.create(stone, {
      position: Vector3.create(spot.x, 0.03, spot.z),
      scale: Vector3.create(1.6, 0.06, 1.6)
    })
    MeshRenderer.setBox(stone)
    MeshCollider.setBox(stone)
    Material.setPbrMaterial(stone, {
      albedoColor: COLORS.stone,
      roughness: 1,
      metallic: 0
    })
  }
}

// Four lanterns at the plaza edge. Pole + emissive glow sphere, no realtime light.
function createLanterns(): void {
  const angles = [45, 135, 225, 315]
  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180
    const x = 16 + Math.cos(rad) * 7.5
    const z = 16 + Math.sin(rad) * 7.5

    const pole = engine.addEntity()
    Transform.create(pole, {
      position: Vector3.create(x, 1.1, z),
      scale: Vector3.create(1, 2.2, 1)
    })
    MeshRenderer.setCylinder(pole, 0.08, 0.1)
    MeshCollider.setCylinder(pole, 0.08, 0.1)
    Material.setPbrMaterial(pole, { albedoColor: COLORS.lanternPole })

    const glow = engine.addEntity()
    Transform.create(glow, {
      position: Vector3.create(x, 2.35, z)
    })
    MeshRenderer.setSphere(glow)
    Material.setPbrMaterial(glow, {
      emissiveColor: { r: 1, g: 0.62, b: 0.3 },
      emissiveIntensity: 2.2
    })
  }
}

// Small props with validated collision masks.
// bush-02 / bush-03: HAVE _collider meshes -> invisibleMeshesCollisionMask 3
function placeBushes(): void {
  const spots = [
    { x: 8, z: 20, rot: 30, model: 'assets/Models/bush-02.glb' },
    { x: 24, z: 20, rot: 120, model: 'assets/Models/bush-03.glb' },
    { x: 20, z: 8, rot: 210, model: 'assets/Models/bush-02.glb' },
    { x: 8, z: 12, rot: 300, model: 'assets/Models/bush-03.glb' },
    { x: 23.5, z: 11, rot: 45, model: 'assets/Models/bush-02.glb' },
    { x: 11, z: 23.5, rot: 15, model: 'assets/Models/bush-03.glb' }
  ]
  for (const s of spots) {
    const bush = engine.addEntity()
    Transform.create(bush, {
      position: Vector3.create(s.x, 0.03, s.z),
      rotation: Quaternion.fromEulerDegrees(0, s.rot, 0)
    })
    GltfContainer.create(bush, {
      src: s.model,
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 3
    })
  }
}

// fern: no colliders, has idle sway animation -> mask 3 + Animator
function placeFerns(): void {
  const spots = [
    { x: 21, z: 22.5, rot: 60 },
    { x: 10.5, z: 21, rot: 200 },
    { x: 21.5, z: 10, rot: 320 }
  ]
  for (const s of spots) {
    const fern = engine.addEntity()
    Transform.create(fern, {
      position: Vector3.create(s.x, 0, s.z),
      rotation: Quaternion.fromEulerDegrees(0, s.rot, 0)
    })
    GltfContainer.create(fern, {
      src: 'assets/Models/fern.glb',
      visibleMeshesCollisionMask: 3,
      invisibleMeshesCollisionMask: 0
    })
    Animator.create(fern, {
      states: [{ clip: 'fernidle', playing: true, loop: true }]
    })
  }
}

// boulders: have _collider meshes -> invisible mask 3
function placeBoulders(): void {
  const spots = [
    { x: 22.8, z: 17.5, rot: 25 },
    { x: 9.5, z: 14.5, rot: 160 }
  ]
  for (const s of spots) {
    const rock = engine.addEntity()
    Transform.create(rock, {
      position: Vector3.create(s.x, 0.9, s.z),
      rotation: Quaternion.fromEulerDegrees(0, s.rot, 0)
    })
    GltfContainer.create(rock, {
      src: 'assets/Models/boulders.glb',
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 3
    })
  }
}

// A few daisies scattered near the path (the ring at the tree is separate).
function placeGardenFlowers(): void {
  const spots = [
    { x: 10.8, z: 10.8, rot: 40 },
    { x: 13.2, z: 9.2, rot: 100 },
    { x: 9.2, z: 13.4, rot: 250 },
    { x: 22, z: 21.5, rot: 30 }
  ]
  for (const s of spots) {
    const flower = engine.addEntity()
    Transform.create(flower, {
      position: Vector3.create(s.x, 0.05, s.z),
      rotation: Quaternion.fromEulerDegrees(0, s.rot, 0)
    })
    GltfContainer.create(flower, {
      src: 'assets/Models/flower-daisy.glb',
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
  }
}

export function setupGarden(): void {
  createGround()
  createPlaza()
  createPath()
  createLanterns()
  placeBushes()
  placeFerns()
  placeBoulders()
  placeGardenFlowers()
}
