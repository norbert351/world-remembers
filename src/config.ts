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
// Production: the stable Render backend for the deployed world.
export const API = {
  baseUrl: 'https://world-remembers.onrender.com'
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

// --- Phase E: world polish ------------------------------------------------

// World Heartbeat / ritual. The interval is the ONLY production-facing knob:
// dev uses 5 minutes, production should be once per world day (86400).
// Everything else in this block is per-phase timing, tunable in one place.
export const RITUAL = {
  // seconds between automatic Memory Moments
  intervalSeconds: 300,
  // per-phase durations, seconds
  quiet: 2, // "THE WORLD IS REMEMBERING..."
  response: 4, // tree glow + wave + stones respond one after another
  sky: 4, // comet crosses the sky
  complete: 2, // "THE WORLD REMEMBERS."
  // the wave ring travels this far from the tree, meters
  waveMaxRadius: 11,
  // comet path across the sky, meters (scene space)
  cometStart: { x: 4, y: 30, z: 6 },
  cometEnd: { x: 28, y: 26, z: 26 }
}

// First-visit onboarding. Three short lines, shown once per session (SDK7
// has no client-side persistent storage; the backend remains the only
// cross-session truth). Each line stays up ONBOARDING.lineMs, then the next.
export const ONBOARDING = {
  enabled: true,
  lines: ['THIS WORLD REMEMBERS.', "Everything you leave behind becomes part of its story.", 'Help the Memory Tree grow.'],
  lineMs: 2200,
  fadeMs: 400
}

// The three visual zones. The tree plaza is warm, the garden is green and
// peaceful, the stone discovery area is darker and mysterious. Each zone
// gets a subtle ground disc so entering it reads without any UI.
export const ZONES = {
  // plaza already has its cylinder; the garden and stone zones get tinted
  // ground discs so the mood shift is visible underfoot
  garden: {
    position: { x: 8, z: 15 },
    radius: 6,
    tint: Color4.fromHexString('#4d7a44cc')
  },
  stone: {
    position: { x: 26, z: 26 },
    radius: 5.5,
    tint: Color4.fromHexString('#2a2733dd')
  }
}

// Extra spawn-to-plaza path stones (the existing three stepping stones are
// kept). These extend the route from the spawn corner toward the tree so the
// tree is the first visual destination.
export const PATH_EXT = [
  { x: 8.2, z: 8.2 },
  { x: 10.9, z: 10.9 },
  { x: 13.4, z: 13.4 }
]

// Low stone border around the plaza, ring segments.
export const PLAZA_BORDER = {
  radius: 8.9,
  segments: 16
}

// Benches: two lightweight resting spots at the plaza edge.
export const BENCHES = [
  { x: 21.2, z: 14.4, rotation: 220 },
  { x: 11.4, z: 20.2, rotation: 40 }
]

// Glowing trail plants: a few small emissive markers that lead the eye from
// the garden toward each Memory Stone. Environmental storytelling, no arrows.
export const TRAILS = [
  // toward garden stone (6.8, 22.8)
  { x: 8.6, z: 19.4 },
  { x: 7.2, z: 21.2 },
  // toward ridge stone (26.2, 26.2)
  { x: 22.6, z: 22.6 },
  { x: 24.6, z: 24.6 }
]

// The Memory Lighthouse: community landmark, visible from most of the
// island. Positioned on the east ridge overlooking the garden.
export const LIGHTHOUSE = {
  position: { x: 27.5, z: 17.2 }
}

// --- Living world visual evolution (Phase F) --------------------------------

// Per memory level: what the scene toggles. All reuse existing entities
// (lantern glow, tree embers, motes, daisy rings) — no new environments.
export const LEVEL_VISUALS = [
  {
    level: 1,
    flowerRing: 0,
    lanternBoost: 0,
    treeGlowBoost: 0,
    moteBoost: 0,
    skyTime: 0.72
  },
  {
    level: 2,
    flowerRing: 4,
    lanternBoost: 0.15,
    treeGlowBoost: 0.2,
    moteBoost: 2,
    skyTime: 0.6
  },
  {
    level: 3,
    flowerRing: 8,
    lanternBoost: 0.3,
    treeGlowBoost: 0.35,
    moteBoost: 4,
    skyTime: 0.52
  },
  {
    level: 4,
    flowerRing: 12,
    lanternBoost: 0.5,
    treeGlowBoost: 0.5,
    moteBoost: 6,
    skyTime: 0.45
  },
  {
    level: 5,
    flowerRing: 16,
    lanternBoost: 0.7,
    treeGlowBoost: 0.8,
    moteBoost: 8,
    skyTime: 0.4
  }
] as const

export function levelVisuals(level: number): (typeof LEVEL_VISUALS)[number] {
  const v = LEVEL_VISUALS.find((x) => x.level === level)
  return v ?? LEVEL_VISUALS[0]
}
