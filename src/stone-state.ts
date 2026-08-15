// Memory Stone state orchestration. Mirrors state.ts: the scene depends on
// StoneProvider, never on fetch directly. The server is authoritative, the
// client never mutates history optimistically.
import { getPlayerIdentity } from './identity'
import type { ReactionId } from '../shared/stones'

export interface StoneSummary {
  id: string
  memoryCount: number
}

export interface StoneMemory {
  playerId: string
  reaction: ReactionId
  createdAt: string
}

export interface StoneDetail {
  id: string
  memoryCount: number
  memories: StoneMemory[]
}

export interface StoneProvider {
  listStones(): Promise<StoneSummary[]>
  loadStone(stoneId: string): Promise<StoneDetail>
  leaveMemory(stoneId: string, playerId: string, reaction: ReactionId): Promise<StoneDetail>
}

// Mock provider: in-memory only. Used in tests and as a local fallback.
class LocalStoneProvider implements StoneProvider {
  private counts = new Map<string, number>()
  private histories = new Map<string, StoneMemory[]>()

  async listStones(): Promise<StoneSummary[]> {
    return ['garden', 'tree', 'ridge'].map((id) => ({
      id,
      memoryCount: this.counts.get(id) ?? 0
    }))
  }

  async loadStone(stoneId: string): Promise<StoneDetail> {
    const memories = this.histories.get(stoneId) ?? []
    return { id: stoneId, memoryCount: memories.length, memories: [...memories] }
  }

  async leaveMemory(stoneId: string, playerId: string, reaction: ReactionId): Promise<StoneDetail> {
    const memories = this.histories.get(stoneId) ?? []
    if (memories.some((m) => m.playerId === playerId)) {
      throw new Error('already_left_memory')
    }
    memories.unshift({ playerId, reaction, createdAt: new Date().toISOString() })
    this.histories.set(stoneId, memories)
    this.counts.set(stoneId, memories.length)
    return { id: stoneId, memoryCount: memories.length, memories: [...memories] }
  }
}

export const stoneState = {
  // all stones with their counts, from GET /stones
  stones: [] as StoneSummary[],
  // the stone whose memory UI is open, null when closed
  selected: null as string | null,
  // per-stone history cache, keyed by stone id
  details: {} as Record<string, StoneDetail>,
  // in-flight flags and status, mirrors contributionState
  loadingStones: false,
  loadingDetail: false,
  saving: false,
  status: 'idle' as 'idle' | 'submitting' | 'success' | 'error',
  // epoch ms of the last successful save, drives the success toast
  lastSavedAt: 0,
  // epoch ms of the last failed save, drives the error toast
  lastErrorAt: 0,
  // true when the initial GET /stones failed; stones still render empty
  loadError: false,
  provider: new LocalStoneProvider() as StoneProvider,
  // bumped on every change so the UI re-renders
  version: 0
}

// Identity comes from the same DCL session resolver as contributions.
let identityResolver: () => string | null = getPlayerIdentity
export function setStoneIdentityResolver(fn?: () => string | null): void {
  identityResolver = fn ?? getPlayerIdentity
}

function bump(): void {
  stoneState.version++
}

// Whether the current player already left a memory on the selected stone.
// The server is the source of truth: this is derived from the fetched
// history, never from local bookkeeping.
export function myMemoryOn(stoneId: string): StoneMemory | null {
  const detail = stoneState.details[stoneId]
  if (!detail) return null
  const playerId = identityResolver()
  if (!playerId) return null
  return detail.memories.find((m) => m.playerId === playerId) ?? null
}

// Initial sync: GET /stones. Fills the in-world labels. Returns false when
// the API is unreachable; the stones still render with zero labels.
export async function loadStones(): Promise<boolean> {
  stoneState.loadingStones = true
  bump()
  try {
    const stones = await stoneState.provider.listStones()
    stoneState.stones = stones
    stoneState.loadError = false
    return true
  } catch {
    stoneState.loadError = true
    return false
  } finally {
    stoneState.loadingStones = false
    bump()
  }
}

// Fetch one stone's history into the cache. No-op when already cached.
export async function loadStoneDetail(stoneId: string): Promise<StoneDetail | null> {
  if (stoneState.details[stoneId]) return stoneState.details[stoneId]
  stoneState.loadingDetail = true
  bump()
  try {
    const detail = await stoneState.provider.loadStone(stoneId)
    stoneState.details[stoneId] = detail
    return detail
  } catch {
    return null
  } finally {
    stoneState.loadingDetail = false
    bump()
  }
}

// Open the memory UI for a stone. Returns the cached detail when already
// fetched, otherwise triggers a fetch.
export function selectStone(stoneId: string): void {
  stoneState.selected = stoneId
  bump()
  void loadStoneDetail(stoneId)
}

export function closeStone(): void {
  stoneState.selected = null
  bump()
}

// Player leaves a memory on the selected stone. Server-confirmed only: the
// returned history is applied, the success toast fires after persistence,
// and duplicate taps are ignored while a save is in flight. The server
// rejects a second memory from the same player with already_left_memory.
export async function leaveMemoryOnStone(reaction: ReactionId): Promise<boolean> {
  const stoneId = stoneState.selected
  if (!stoneId) return false
  if (stoneState.saving) return false
  if (myMemoryOn(stoneId)) return false
  stoneState.saving = true
  stoneState.status = 'submitting'
  bump()
  try {
    const playerId = identityResolver()
    if (!playerId) throw new Error('no_identity')
    const detail = await stoneState.provider.leaveMemory(stoneId, playerId, reaction)
    stoneState.details[stoneId] = detail
    const summary = stoneState.stones.find((s) => s.id === stoneId)
    if (summary) summary.memoryCount = detail.memoryCount
    stoneState.status = 'success'
    stoneState.lastSavedAt = Date.now()
    bump()
    return true
  } catch (err) {
    stoneState.status = 'error'
    stoneState.lastErrorAt = Date.now()
    // a 409 already_left_memory still needs the server's stored reaction,
    // so reload the detail to reflect what the server actually has
    if (err instanceof Error && err.message === 'already_left_memory') {
      await loadStoneDetail(stoneId)
    }
    bump()
    return false
  } finally {
    stoneState.saving = false
  }
}
