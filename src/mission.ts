// Mission state. The server is authoritative: the client applies
// server-returned mission state and never computes progress locally.
// Progress is derived server-side from distinct participants (see
// shared/mission.ts), so nothing here can be client-injected.
import { missionFromServer, type MissionState } from '../shared/mission'
import { getPlayerIdentity } from './identity'

export interface MissionProvider {
  load(): Promise<MissionState>
}

// Mock provider: in-memory only. Used in tests and as a local fallback.
class LocalMissionProvider implements MissionProvider {
  private progress = 0
  async load(): Promise<MissionState> {
    return missionFromServer({
      mission: {
        id: 'restore-forgotten-garden',
        title: 'RESTORE THE FORGOTTEN GARDEN',
        description: 'The garden is fading.',
        progress: this.progress,
        target: 100,
        completed: false
      }
    })
  }
}

export const missionState = {
  mission: null as MissionState | null,
  loaded: false,
  loading: false,
  loadError: false,
  // bump on every change so the UI re-renders fresh values
  version: 0,
  provider: new LocalMissionProvider() as MissionProvider
}

// Identity comes from the same DCL session resolver as contributions.
let identityResolver: () => string | null = getPlayerIdentity
export function setMissionIdentityResolver(fn?: () => string | null): void {
  identityResolver = fn ?? getPlayerIdentity
}

function bump(): void {
  missionState.version++
}

// Apply a validated mission payload. Only used for server responses.
export function applyMission(mission: MissionState): void {
  missionState.mission = mission
  missionState.loaded = true
  missionState.loadError = false
  bump()
}

// Initial sync: GET /mission. Returns false when the API is unreachable;
// the scene stays fully playable with no mission shown.
export async function loadMission(): Promise<boolean> {
  if (missionState.loading) return missionState.loaded
  missionState.loading = true
  bump()
  try {
    const mission = await missionState.provider.load()
    applyMission(mission)
    return true
  } catch {
    missionState.loadError = true
    bump()
    return false
  } finally {
    missionState.loading = false
  }
}

// Whether the current player already participated (contributed or left a
// memory). The mission panel shows this as the player's own checkmark.
// Evidence is session-local and REAL: set only on server-confirmed actions
// (see state.ts playerContributed flag and stone-state.ts myStoneMemories).
export function playerHasParticipated(): boolean {
  return playerContributedThisSession() || playerStoneMemories().length > 0
}

// wired by index.ts to the real session evidence
let contributedFlag: () => boolean = () => false
export function setContributedFlag(fn: () => boolean): void {
  contributedFlag = fn
}
function playerContributedThisSession(): boolean {
  return contributedFlag()
}

let stoneMemoriesOf: () => string[] = () => []
export function setStoneMemoriesOf(fn: () => string[]): void {
  stoneMemoriesOf = fn
}
function playerStoneMemories(): string[] {
  return stoneMemoriesOf()
}

// Mission helpers for the UI.
export function missionProgress(): number {
  return missionState.mission?.progress ?? 0
}

export function missionTarget(): number {
  return missionState.mission?.target ?? 100
}

export function missionCompleted(): boolean {
  return missionState.mission?.completed ?? false
}

export function missionActive(): boolean {
  return missionState.mission !== null && !missionState.mission.completed
}
