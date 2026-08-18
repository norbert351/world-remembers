// Memory Expedition: deterministic daily mission, now realm-aware.
// Shared by the backend (authority) and the scene (renderer).
//
// Day seed = date (YYYY-MM-DD) + world id, hashed deterministically. The seed
// picks today's Memory Realm and its three objectives, so the route changes
// every day but the server always knows exactly where each memory is. The
// client never sends positions — only fragment ids — and the server validates
// everything (identity, day, realm, fragment ownership, guardian cleared, no
// duplicates).
//
// Realm selection and objective positions live in shared/realms.ts.

import {
  isObjectiveId,
  objectiveWorld,
  realmById,
  realmForDay,
  realmNameForObjective,
  type RealmDefinition
} from './realms'

export const EXPEDITION = {
  worldId: 'the-world-remembers',
  fragmentsPerDay: 3,
  guardianHits: 3
} as const

// Fragment ids are now the realm's objective ids (e.g. "forgotten_forest-1").
export type ExpeditionFragmentId = string

// Deterministic day key: YYYY-MM-DD in the server's timezone. The scene only
// ever echoes what the server returns; it never computes its own.
export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Small deterministic string hash (FNV-1a). Not cryptographic — it only needs
// to vary by day, not resist attack. Preserved for the day seed.
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

// Which realm is "today's destination".
export function realmForExpeditionDay(dayKey: string): RealmDefinition {
  return realmForDay(dayKey)
}

// Today's three fragment ids, in journey order (the realm's objectives in
// their authored order, which is the discovery route).
export function fragmentsForDay(dayKey: string): ExpeditionFragmentId[] {
  return realmForDay(dayKey).objectives.map((o) => o.id)
}

export function isFragmentId(v: unknown): v is ExpeditionFragmentId {
  return isObjectiveId(v)
}

// Human label for a fragment's realm (UI + tests).
export function zoneOf(id: string): string {
  return realmNameForObjective(id) ?? 'WORLD'
}

// World position of a fragment (used by the scene + backend to place rigs).
export function fragmentLocation(id: string): { x: number; z: number } | undefined {
  return objectiveWorld(id)
}

// --- client-side payloads ---------------------------------------------------

export interface ExpeditionFragmentState {
  id: ExpeditionFragmentId
  location: { x: number; z: number }
  zone: string
  // realm this fragment belongs to (server-derived, for the client's next-hit
  // text and anti-mismatch checks)
  realmId: string
  // 0..guardianHits — how many dispel hits the CURRENT PLAYER landed
  hits: number
  // true once the fragment has been collected by this player
  collected: boolean
}

export interface ExpeditionState {
  day: string
  seed: number
  realm: { id: string; name: string }
  fragments: ExpeditionFragmentState[]
  completed: boolean
  // async social proof: how many players completed today
  todayCompletions: number
}

// Server-authoritative payload validator. Malformed payloads throw; the
// client never trusts unvalidated data. Enforces that every fragment belongs
// to the declared realm (a wrong-realm payload is rejected outright).
export function expeditionFromServer(body: unknown): ExpeditionState {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('bad_expedition')
  const b = body as Record<string, unknown>
  const day = b.day
  const seed = b.seed
  const realm = b.realm
  const fragments = b.fragments
  const completed = b.completed
  const todayCompletions = b.todayCompletions
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('bad_expedition')
  if (typeof seed !== 'number' || !Number.isInteger(seed)) throw new Error('bad_expedition')
  if (typeof realm !== 'object' || realm === null) throw new Error('bad_expedition')
  const realmRaw = realm as Record<string, unknown>
  const realmDef = typeof realmRaw.id === 'string' ? realmById(realmRaw.id) : undefined
  if (!realmDef) throw new Error('bad_expedition')
  if (typeof realmRaw.name !== 'string') throw new Error('bad_expedition')
  if (typeof completed !== 'boolean') throw new Error('bad_expedition')
  if (typeof todayCompletions !== 'number' || !Number.isInteger(todayCompletions) || todayCompletions < 0) {
    throw new Error('bad_expedition')
  }
  if (!Array.isArray(fragments) || fragments.length !== EXPEDITION.fragmentsPerDay) throw new Error('bad_expedition')
  const realmIds = new Set(realmDef.objectives.map((o) => o.id))
  const parsed: ExpeditionFragmentState[] = fragments.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('bad_expedition')
    const r = raw as Record<string, unknown>
    const id = r.id
    const loc = r.location
    const hits = r.hits
    const collected = r.collected
    if (!isFragmentId(id)) throw new Error('bad_expedition')
    // every fragment must belong to the declared realm
    if (!realmIds.has(id)) throw new Error('wrong_realm')
    if (typeof loc !== 'object' || loc === null) throw new Error('bad_expedition')
    const { x, z } = loc as Record<string, unknown>
    if (typeof x !== 'number' || typeof z !== 'number') throw new Error('bad_expedition')
    if (typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0 || hits > EXPEDITION.guardianHits) {
      throw new Error('bad_expedition')
    }
    if (typeof collected !== 'boolean') throw new Error('bad_expedition')
    return { id, location: { x, z }, zone: realmDef.name, realmId: realmDef.id, hits, collected }
  })
  return {
    day,
    seed,
    realm: { id: realmDef.id, name: realmDef.name },
    fragments: parsed,
    completed,
    todayCompletions
  }
}
