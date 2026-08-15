// Single source of truth for Memory Stones.
// Shared by the scene (src/config.ts, src/stone-state.ts) and the backend
// (backend/src/app.ts, migrations). Do not redefine these anywhere else.

// Fixed reaction whitelist. No free-form text: the client picks one of these
// and the server rejects anything else.
export const REACTIONS = [
  { id: 'found', emoji: '🌱', label: 'I found this place.' },
  { id: 'beautiful', emoji: '✨', label: 'This place is beautiful.' },
  { id: 'return', emoji: '🌙', label: 'I\'ll come back.' },
  { id: 'someone', emoji: '❤️', label: 'Someone was here.' }
] as const

export type ReactionId = (typeof REACTIONS)[number]['id']

export const REACTION_IDS: readonly string[] = REACTIONS.map((r) => r.id)

export function isReactionId(value: unknown): value is ReactionId {
  return typeof value === 'string' && (REACTION_IDS as readonly string[]).includes(value)
}

// The three stones. The id is the config identifier shared with the backend
// (memory_stones.id) and the scene (placement config in src/config.ts).
export const STONES = [
  { id: 'garden', name: 'GARDEN STONE' },
  { id: 'tree', name: 'TREE STONE' },
  { id: 'ridge', name: 'RIDGE STONE' }
] as const

export type StoneId = (typeof STONES)[number]['id']

export const STONE_IDS: readonly string[] = STONES.map((s) => s.id)

export function isStoneId(value: unknown): value is StoneId {
  return typeof value === 'string' && (STONE_IDS as readonly string[]).includes(value)
}
