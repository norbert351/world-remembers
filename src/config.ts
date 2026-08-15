// World state configuration. Every tunable number lives here so the scene
// layout and tree progression can be adjusted after mobile testing.
import { Color3, Color4 } from '@dcl/sdk/math'
import { STAGE_NAMES, STAGE_THRESHOLDS } from '../shared/world-state'

// Scene footprint: 2x2 parcels = 32m x 32m. Parcel coords stay easy to
// change in scene.json without touching code.
export const WORLD = {
  size: 32, // meters per side (2x2 parcels of 16m)
  maxHeight: 46 // official limit for 4 parcels: log2(4+1)*20
}

// Memory Tree placement. Native bbox validated with node transforms:
// min (-1.53, -0.33, -1.71), max (2.49, 3.38, 1.75). Scale 2 + y 0.66 puts
// the base exactly on the ground (y=0). World bbox:
// x [12.94, 20.98], y [0, 7.42], z [12.58, 19.5] all inside scene bounds.
export const TREE = {
  model: 'assets/Models/tree-memory.glb',
  clip: 'Tree_Action',
  position: { x: 16, y: 0.66, z: 16 },
  scale: 2,
  // canopy center, where the glowing heart lives
  heart: { x: 16, y: 5.0, z: 16 }
}

// Tree progression thresholds and names live in ../shared/world-state.ts
// (single source of truth, shared with the backend).
export { STAGE_NAMES, STAGE_THRESHOLDS }

export const STAGES = {
  names: [...STAGE_NAMES],
  // heart glow per stage (emissive Color3)
  heartColor: [
    Color3.fromHexString('#6b5a33'), // dormant: dim ember
    Color3.fromHexString('#b08a3a'), // awakened: first warm light
    Color3.fromHexString('#e8b64c'), // growing: golden
    Color3.fromHexString('#ffe08a') // flourishing: radiant
  ],
  heartIntensity: [0.8, 1.6, 2.6, 3.6],
  // warm point light at the tree heart, candela
  lightIntensity: [4000, 12000, 25000, 45000],
  // skybox mood: the world warms from dusk toward golden day as it remembers
  skyTimes: [
    70000, // dormant: 19:26 dusk
    67200, // awakened: 18:40 sunset
    64800, // growing: 18:00 golden hour
    59400 // flourishing: 16:30 bright warm day
  ],
  // bloom flowers at the base + floating motes per stage
  flowersVisible: [4, 8, 12, 16],
  motesVisible: [0, 3, 6, 10]
}

// Growth feedback pulse timing (seconds). Drives the heart pulse system.
export const PULSE = {
  duration: 0.7,
  heartScalePeak: 1.8,
  ringScalePeak: 1.9,
  emissiveFlash: 4.5
}

// Palette for the environment
export const COLORS = {
  ground: Color4.fromHexString('#73925f'),
  plaza: Color4.fromHexString('#cdc2ae'),
  stone: Color4.fromHexString('#a89a86'),
  path: Color4.fromHexString('#b5a68f'),
  lanternPole: Color4.fromHexString('#4a4038'),
  lanternGlow: Color4.fromHexString('#ffb45e'),
  bush: Color4.fromHexString('#5f8f4f')
}

// World API endpoint. One place, used by the HTTP provider only.
// Currently a Cloudflare tunnel URL: the VM's LAN IP is unreachable from
// the phone, and the scene runtime has no location global to derive a host.
// For the deployed world this must be an HTTPS URL reachable from the
// Decentraland client (see README).
export const API = {
  baseUrl: 'https://dpi-blast-carey-looked.trycloudflare.com'
}

// Memory Stones: id must match shared/stones.ts STONES. Position is the
// stone root in scene space (32x32 world), rotation faces it toward the
// plaza. Placements checked against existing props (bushes, ferns, lanterns,
// boulders, path stones) with at least ~3m clearance. The rune color
// distinguishes each stone at a glance.
export const STONES = [
  {
    id: 'garden',
    position: { x: 6.8, y: 0, z: 22.8 },
    rotation: 210,
    runeColor: Color3.fromHexString('#9fd8ff')
  },
  {
    id: 'tree',
    position: { x: 19.5, y: 0, z: 14.5 },
    rotation: 315,
    runeColor: Color3.fromHexString('#b9a4ff')
  },
  {
    id: 'ridge',
    position: { x: 26.2, y: 0, z: 26.2 },
    rotation: 45,
    runeColor: Color3.fromHexString('#ffd9a0')
  }
] as const
