// Memory Realms — shared by the backend (authority) and the scene (renderer).
//
// The World becomes a Hub + a set of themed Memory Realms. Today's Realm is
// derived deterministically from the date (same FNV-style seed family as the
// expedition), so the server and every client agree on "today's destination"
// with nothing stored and nothing client-selectable. A Realm's three
// objectives form a journey (entry portal -> objective 1 -> midpoint landmark
// -> objective 2 -> objective 3 -> Memory Shrine), each at real distance from
// the last, so the world feels much larger than a single garden.
//
// Coordinates are realm-LOCAL (within the realm's 48x48 m region). The scene
// maps them to world positions by adding the realm origin; the backend only
// ever deals in objective ids, never positions (same anti-spoof posture as the
// existing expedition).

export interface RealmObjective {
  id: string // e.g. "forgotten_forest-1"
  local: { x: number; z: number } // within the realm region, meters
  flavor: string // short discovery line for this objective
}

export interface RealmDefinition {
  id: string
  name: string
  description: string
  mood: string
  // the realm's tiny story (shown one line at a time at each objective)
  story: { fragLines: string[]; final: string }
  // realm-local landmards that anchor spatial memory
  entry: { name: string; local: { x: number; z: number } }
  mid: { name: string; local: { x: number; z: number } }
  final: { name: string; local: { x: number; z: number } }
  shrine: { local: { x: number; z: number } }
  // where the player lands when entering / stands to return home
  portalIn: { local: { x: number; z: number } }
  portalOut: { local: { x: number; z: number } }
  // world (scene-local) offset of the realm region's origin (south-west)
  origin: { x: number; z: number }
  // sky tint for "I am somewhere else"
  sky: { fixedTime: number }
  objectives: RealmObjective[]
}

// A realm region is 48x48 m (3x3 parcels) and sits inside the larger World
// scene. Origins are placed so hub + realms are physically separated.
const REGION = 48

export const REALMS: RealmDefinition[] = [
  {
    id: 'forgotten_forest',
    name: 'The Forgotten Forest',
    description: 'A bioluminescent wood where something ancient still remembers.',
    mood: 'mysterious · quiet · full of pale light',
    story: {
      fragLines: [
        'A memory was buried beneath the roots.',
        'It remembers people who once walked here.',
        'It remembers why they left.'
      ],
      final: 'THE FOREST REMEMBERS.'
    },
    entry: { name: 'The Ancient Gate', local: { x: 6, z: 42 } },
    mid: { name: 'The Glowing Tree', local: { x: 24, z: 22 } },
    final: { name: 'The Memory Shrine', local: { x: 42, z: 3 } },
    shrine: { local: { x: 42, z: 3 } },
    portalIn: { local: { x: 6, z: 42 } },
    portalOut: { local: { x: 43, z: 6 } },
    origin: { x: 48, z: 96 },
    sky: { fixedTime: 50000 }, // deep blue night
    objectives: [
      { id: 'forgotten_forest-1', local: { x: 14, z: 31 }, flavor: 'Beneath the roots, a memory sleeps.' },
      { id: 'forgotten_forest-2', local: { x: 32, z: 13 }, flavor: 'The path remembers footsteps.' },
      { id: 'forgotten_forest-3', local: { x: 39, z: 6 }, flavor: 'The forest held this for you.' }
    ]
  },
  {
    id: 'lost_ruins',
    name: 'The Lost Ruins',
    description: 'Columns and arches of a civilisation that left everything behind.',
    mood: 'ancient · abandoned · sun-bleached stone',
    story: {
      fragLines: [
        'The first memory was left on a broken altar.',
        'It remembers the ones who built these walls.',
        'It remembers the day the doors closed.'
      ],
      final: 'THE RUINS REMEMBER.'
    },
    entry: { name: 'The Broken Arch', local: { x: 6, z: 42 } },
    mid: { name: 'The Fallen Courtyard', local: { x: 24, z: 22 } },
    final: { name: 'The Sundial Shrine', local: { x: 42, z: 3 } },
    shrine: { local: { x: 42, z: 3 } },
    portalIn: { local: { x: 6, z: 42 } },
    portalOut: { local: { x: 43, z: 6 } },
    origin: { x: 96, z: 48 },
    sky: { fixedTime: 60000 }, // warm amber dusk
    objectives: [
      { id: 'lost_ruins-1', local: { x: 13, z: 30 }, flavor: 'An altar holds a forgotten vow.' },
      { id: 'lost_ruins-2', local: { x: 31, z: 12 }, flavor: 'Vines hide a memory of voices.' },
      { id: 'lost_ruins-3', local: { x: 39, z: 6 }, flavor: 'The sundial points to the past.' }
    ]
  },
  {
    id: 'starfall_island',
    name: 'Starfall Island',
    description: 'Floating land and drifting light above a sea of stars.',
    mood: 'dreamlike · cosmic · weightless',
    story: {
      fragLines: [
        'A star fell here and left a memory of light.',
        'It remembers the sky before the dark.',
        'It remembers the moment everything changed.'
      ],
      final: 'THE STARS REMEMBER.'
    },
    entry: { name: 'The Star Bridge', local: { x: 6, z: 42 } },
    mid: { name: 'The Drifting Monolith', local: { x: 24, z: 22 } },
    final: { name: 'The Falling Star', local: { x: 42, z: 3 } },
    shrine: { local: { x: 42, z: 3 } },
    portalIn: { local: { x: 6, z: 42 } },
    portalOut: { local: { x: 43, z: 6 } },
    origin: { x: 144, z: 144 },
    sky: { fixedTime: 30000 }, // starry deep night
    objectives: [
      { id: 'starfall_island-1', local: { x: 14, z: 31 }, flavor: 'A fallen star waits to be remembered.' },
      { id: 'starfall_island-2', local: { x: 32, z: 13 }, flavor: 'Light pools where something landed.' },
      { id: 'starfall_island-3', local: { x: 39, z: 6 }, flavor: 'The last light rests here.' }
    ]
  }
]

export type RealmId = (typeof REALMS)[number]['id']

const ALL_IDS = new Set(REALMS.flatMap((r) => r.objectives.map((o) => o.id)))

export function isRealmId(v: unknown): v is RealmId {
  return typeof v === 'string' && REALMS.some((r) => r.id === v)
}

// Is this an objective/fragment id at all (any realm)?
export function isObjectiveId(v: unknown): v is string {
  return typeof v === 'string' && ALL_IDS.has(v)
}

export function realmById(id: string): RealmDefinition | undefined {
  return REALMS.find((r) => r.id === id)
}

export function objectiveById(id: string): RealmObjective | undefined {
  for (const r of REALMS) {
    const o = r.objectives.find((x) => x.id === id)
    if (o) return o
  }
  return undefined
}

// Small deterministic hash (FNV-1a). Not cryptographic; it only needs to vary
// by day, matching the expedition's seed family. Defined here (not imported
// from expedition) to avoid a shared->shared circular import.
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const WORLD_ID = 'the-world-remembers'

// Deterministic today's-realm: hash(dayKey + world id) -> one of the realms.
// Same date + world = same realm; different dates rotate.
export function realmForDay(dayKey: string): RealmDefinition {
  return REALMS[fnv1a(`${dayKey}:${WORLD_ID}:realm`) % REALMS.length]
}

// World (scene-local) position of a realm-local point.
export function realmWorld(r: RealmDefinition, local: { x: number; z: number }): { x: number; z: number } {
  return { x: r.origin.x + local.x, z: r.origin.z + local.z }
}

// World position of an objective (used by the scene to place rigs/beacons).
export function objectiveWorld(id: string): { x: number; z: number } | undefined {
  for (const r of REALMS) {
    const o = r.objectives.find((x) => x.id === id)
    if (o) return realmWorld(r, o.local)
  }
  return undefined
}

// Which realm owns this objective/fragment id (or null if unknown).
export function realmOfObjective(id: string): RealmDefinition | undefined {
  return REALMS.find((r) => r.objectives.some((o) => o.id === id))
}

export function realmNameForObjective(id: string): string | undefined {
  return realmOfObjective(id)?.name
}

// All objective ids across every realm (rare-memory pool, tests).
export const ALL_OBJECTIVE_IDS: readonly string[] = REALMS.flatMap((r) => r.objectives.map((o) => o.id))

export { REGION }
