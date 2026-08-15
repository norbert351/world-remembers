// Single source of truth for the mission. Shared by the scene
// (src/mission.ts) and the backend (backend/src/app.ts).
//
// Anti-spam rule (Phase E design decision):
//   mission progress = COUNT(DISTINCT player_id) over
//   (contributions UNION stone_memories)
// One player contributes at most ONE progress point regardless of how many
// times they tap. Progress is DERIVED from existing persistent tables, so
// no mission table exists, nothing can be client-injected, completion is
// persistent by construction, and re-running the migration is a no-op.

export const MISSION = {
  id: 'restore-forgotten-garden',
  title: 'RESTORE THE FORGOTTEN GARDEN',
  description: 'The garden is fading. Every memory left behind helps the world remember what once grew here.',
  target: 100
} as const

export interface MissionState {
  id: string
  title: string
  description: string
  progress: number
  target: number
  completed: boolean
}

// Server-derived progress, validated by the client before applying.
export function missionFromServer(body: unknown): MissionState {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('bad_mission')
  }
  const m = (body as Record<string, unknown>).mission
  if (typeof m !== 'object' || m === null) throw new Error('bad_mission')
  const rec = m as Record<string, unknown>
  if (rec.id !== MISSION.id) throw new Error('bad_mission')
  if (typeof rec.title !== 'string' || typeof rec.description !== 'string') throw new Error('bad_mission')
  const progress = rec.progress
  const target = rec.target
  if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0) throw new Error('bad_mission')
  if (typeof target !== 'number' || !Number.isInteger(target) || target <= 0) throw new Error('bad_mission')
  const completed = rec.completed
  if (typeof completed !== 'boolean') throw new Error('bad_mission')
  // the server never reports progress beyond target
  const clamped = Math.min(progress, target)
  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    progress: clamped,
    target,
    completed: completed || clamped >= target
  }
}
