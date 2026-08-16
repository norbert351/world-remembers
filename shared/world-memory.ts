// World Memory Level + community landmark + daily event + rare memory.
// Shared by the backend (authority) and the scene (renderer).
//
// Everything here is DERIVED from persistent community activity. The
// server computes levels/stages from real tables; the client only renders
// what the server returns. Nothing is client-injectable.

// --- World Memory Level -----------------------------------------------------

// Thresholds: community activity score = contributions + 5 * stone memories
// + 25 * completed expeditions. Configurable in one place.
export const MEMORY_LEVELS = [
  { level: 1, name: 'THE SLEEPING WORLD', threshold: 0 },
  { level: 2, name: 'THE AWAKENING', threshold: 40 },
  { level: 3, name: 'THE GROWING WORLD', threshold: 120 },
  { level: 4, name: 'THE LIVING WORLD', threshold: 300 },
  { level: 5, name: 'THE REMEMBERED WORLD', threshold: 600 }
] as const

export const MEMORY_SCORE = {
  contribution: 1,
  stoneMemory: 5,
  completedExpedition: 25
} as const

export interface CommunityActivity {
  contributions: number
  stoneMemories: number
  completedExpeditions: number
}

export function communityScore(a: CommunityActivity): number {
  return (
    a.contributions * MEMORY_SCORE.contribution +
    a.stoneMemories * MEMORY_SCORE.stoneMemory +
    a.completedExpeditions * MEMORY_SCORE.completedExpedition
  )
}

// Deterministic level from the score. Clamped to [1, 5].
export function memoryLevelFor(a: CommunityActivity): { level: number; name: string; score: number } {
  const score = communityScore(a)
  let level = 1
  let name: string = MEMORY_LEVELS[0].name
  for (const l of MEMORY_LEVELS) {
    if (score >= l.threshold) {
      level = l.level
      name = l.name
    }
  }
  return { level, name, score }
}

// --- Community landmark (the Memory Lighthouse) -----------------------------

// Progress comes from completed expeditions (the community builds the
// lighthouse by restoring memories). 5 stages, thresholds configurable.
export const LANDMARK_STAGES = [
  { stage: 1, name: 'FOUNDATION', threshold: 0 },
  { stage: 2, name: 'TOWER', threshold: 3 },
  { stage: 3, name: 'LANTERN', threshold: 10 },
  { stage: 4, name: 'BEAM', threshold: 25 },
  { stage: 5, name: 'BEACON', threshold: 60 }
] as const

export function landmarkStageFor(completedExpeditions: number): { stage: number; name: string } {
  let stage = 1
  let name: string = LANDMARK_STAGES[0].name
  for (const s of LANDMARK_STAGES) {
    if (completedExpeditions >= s.threshold) {
      stage = s.stage
      name = s.name
    }
  }
  return { stage, name }
}

// --- Daily Memory Pulse -----------------------------------------------------

// The daily event is deterministic: it "happens" once a day, keyed to the
// day string. All players derive the same state from the same day key.
// The server marks it triggered when the first expedition of the day is
// completed (or the day's contributions pass a small threshold).
export function dailyPulseDay(day: string): string {
  return day
}

// --- Rare memory ------------------------------------------------------------

// One location per day, deterministically selected from the expedition
// pool. First discoverer is recorded by the server (one row per day).
export function rareLocationForDay(day: string, pool: readonly string[]): string {
  // FNV-ish: deterministic from the day string
  let h = 0
  for (let i = 0; i < day.length; i++) {
    h = (Math.imul(h, 31) + day.charCodeAt(i)) | 0
  }
  return pool[Math.abs(h) % pool.length]
}

// Location reactions (G4): fixed whitelist, same anti-moderation design as
// stone reactions.
export const LOCATION_REACTIONS = [
  { id: 'remembered', emoji: '❤️', label: 'REMEMBERED' },
  { id: 'growing', emoji: '🌱', label: 'GROWING' },
  { id: 'beautiful', emoji: '✨', label: 'BEAUTIFUL' },
  { id: 'iwashere', emoji: '👋', label: 'I WAS HERE' }
] as const

export type LocationReactionId = (typeof LOCATION_REACTIONS)[number]['id']

export function isLocationReactionId(v: unknown): v is LocationReactionId {
  return typeof v === 'string' && LOCATION_REACTIONS.some((r) => r.id === v)
}

export const LOCATION_REACTION_IDS: readonly string[] = LOCATION_REACTIONS.map((r) => r.id)
