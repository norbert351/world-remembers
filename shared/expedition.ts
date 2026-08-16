// Memory Expedition: deterministic daily mission. Shared by the backend
// (authority) and the scene (renderer).
//
// Day seed = date (YYYY-MM-DD) + world id, hashed deterministically. The
// seed picks fragment spawn points from a fixed list of safe locations, so
// the route changes every day but the server always knows exactly where
// each fragment is. The client never sends positions — only fragment ids —
// and the server validates everything (identity, day, fragment existence,
// guardian cleared, no duplicates).

export const EXPEDITION = {
  worldId: 'the-world-remembers',
  fragmentsPerDay: 3,
  guardianHits: 3
} as const

export type ExpeditionFragmentId = 'g1' | 'g2' | 'g3' | 'g4' | 'l1' | 'l2' | 'l3' | 'm1' | 'm2' | 'm3'

// Predefined safe spawn points, all inside the 32x32 world, mobile-reachable,
// collision-free (checked against garden/composition placements).
// g* = garden zone, l* = lighthouse-side zone, m* = memory/stone zone.
export const FRAGMENT_LOCATIONS: Record<ExpeditionFragmentId, { x: number; z: number }> = {
  g1: { x: 6.2, z: 14.0 },
  g2: { x: 9.8, z: 21.6 },
  g3: { x: 13.4, z: 9.6 },
  g4: { x: 17.8, z: 25.2 },
  l1: { x: 26.4, z: 14.6 },
  l2: { x: 29.2, z: 8.4 },
  l3: { x: 25.8, z: 25.4 },
  m1: { x: 21.8, z: 19.8 },
  m2: { x: 11.6, z: 24.6 },
  m3: { x: 7.6, z: 26.8 }
}

export const ALL_FRAGMENT_IDS = Object.keys(FRAGMENT_LOCATIONS) as ExpeditionFragmentId[]

export function isFragmentId(v: unknown): v is ExpeditionFragmentId {
  return typeof v === 'string' && v in FRAGMENT_LOCATIONS
}

// Deterministic day key: YYYY-MM-DD in the server's timezone. The scene
// only ever echoes what the server returns; it never computes its own.
export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Small deterministic string hash (FNV-1a). Not cryptographic — it only
// needs to vary by day, not resist attack.
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// The day's deterministic seed: hash(dayKey + worldId). The backend stores
// nothing about the seed — it is recomputed identically on every request.
export function dailySeed(dayKey: string): number {
  return fnv1a(`${dayKey}:${EXPEDITION.worldId}`)
}

// Pick n distinct fragment ids for a day. Deterministic: same day, same
// set, same order. The order is the intended discovery route.
export function fragmentsForDay(dayKey: string): ExpeditionFragmentId[] {
  const seed = dailySeed(dayKey)
  const pool = [...ALL_FRAGMENT_IDS]
  const picked: ExpeditionFragmentId[] = []
  let state = seed
  for (let i = 0; i < EXPEDITION.fragmentsPerDay && pool.length > 0; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const idx = state % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

// Human-readable zone label for a fragment id (UI + tests).
export function zoneOf(id: ExpeditionFragmentId): string {
  if (id.startsWith('g')) return 'GARDEN'
  if (id.startsWith('l')) return 'LIGHTHOUSE'
  return 'MEMORY AREA'
}

// --- client-side payloads ---------------------------------------------------

export interface ExpeditionFragmentState {
  id: ExpeditionFragmentId
  location: { x: number; z: number }
  zone: string
  // 0..guardianHits — how many dispel hits the CURRENT PLAYER landed
  hits: number
  // true once the fragment has been collected by this player
  collected: boolean
}

export interface ExpeditionState {
  day: string
  seed: number
  fragments: ExpeditionFragmentState[]
  completed: boolean
  // async social proof: how many players completed today
  todayCompletions: number
}

// Server-authoritative payload validator. Malformed payloads throw; the
// client never trusts unvalidated data.
export function expeditionFromServer(body: unknown): ExpeditionState {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('bad_expedition')
  const b = body as Record<string, unknown>
  const day = b.day
  const seed = b.seed
  const fragments = b.fragments
  const completed = b.completed
  const todayCompletions = b.todayCompletions
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('bad_expedition')
  if (typeof seed !== 'number' || !Number.isInteger(seed)) throw new Error('bad_expedition')
  if (typeof completed !== 'boolean') throw new Error('bad_expedition')
  if (typeof todayCompletions !== 'number' || !Number.isInteger(todayCompletions) || todayCompletions < 0) {
    throw new Error('bad_expedition')
  }
  if (!Array.isArray(fragments) || fragments.length !== EXPEDITION.fragmentsPerDay) throw new Error('bad_expedition')
  const parsed: ExpeditionFragmentState[] = fragments.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('bad_expedition')
    const r = raw as Record<string, unknown>
    const id = r.id
    const loc = r.location
    const hits = r.hits
    const collected = r.collected
    if (!isFragmentId(id)) throw new Error('bad_expedition')
    if (typeof loc !== 'object' || loc === null) throw new Error('bad_expedition')
    const { x, z } = loc as Record<string, unknown>
    if (typeof x !== 'number' || typeof z !== 'number') throw new Error('bad_expedition')
    if (typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0 || hits > EXPEDITION.guardianHits) {
      throw new Error('bad_expedition')
    }
    if (typeof collected !== 'boolean') throw new Error('bad_expedition')
    return { id, location: { x, z }, zone: zoneOf(id), hits, collected }
  })
  return { day, seed, fragments: parsed, completed, todayCompletions }
}
