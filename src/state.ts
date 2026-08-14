// World state orchestration. The scene depends on WorldStateProvider,
// never on fetch directly. The server is authoritative: the client applies
// server-returned state and never mutates counts optimistically.
import { stageIndexFor } from '../shared/world-state'
import { getPlayerIdentity } from './identity'

export interface WorldStateProvider {
  load(): Promise<number>
  contribute(playerId: string): Promise<number>
}

// Mock provider: in-memory only. Used in tests and as a local fallback.
class LocalProvider implements WorldStateProvider {
  private count = 0
  async load(): Promise<number> {
    return this.count
  }
  async contribute(_playerId: string): Promise<number> {
    this.count++
    return this.count
  }
}

export const worldState = {
  contributions: 0,
  provider: new LocalProvider() as WorldStateProvider,
  // bumped on every change so the UI re-renders fresh values
  version: 0,
  // epoch ms of the last server-confirmed contribution, drives the success toast
  lastContributionAt: 0,
  // true when the initial GET /world failed; scene stays playable
  loadError: false
}

// Contribution in-flight state machine: idle -> submitting -> success -> idle.
// Taps while inFlight are ignored, nothing is queued.
export const contributionState = {
  inFlight: false,
  status: 'idle' as 'idle' | 'submitting' | 'success' | 'error',
  // epoch ms of the last failed contribution, drives the error toast
  lastErrorAt: 0
}

// Identity comes from the DCL session, injectable for tests.
let identityResolver: () => string | null = getPlayerIdentity
export function setIdentityResolver(fn: () => string | null): void {
  identityResolver = fn
}

// One controlled state update path. Every server response (initial load and
// every contribution) flows through here, so the tree stage, counter and UI
// always move together.
let stateListener: ((count: number) => void) | null = null
export function setStateListener(cb: (count: number) => void): void {
  stateListener = cb
}

export function applyWorldState(count: number): void {
  worldState.contributions = count
  worldState.version++
  stateListener?.(count)
}

// Initial sync with the server. Returns false when the API is unreachable;
// the scene stays fully playable with the local default state.
export async function loadWorldState(): Promise<boolean> {
  try {
    const saved = await worldState.provider.load()
    applyWorldState(saved)
    worldState.loadError = false
    return true
  } catch {
    worldState.loadError = true
    worldState.version++
    return false
  }
}

// Player taps the tree. One contribution per request, server-confirmed only:
// the returned count is applied, the success toast and pulse fire after
// persistence, and rapid duplicate taps are ignored while in flight.
export async function contributeToWorld(): Promise<boolean> {
  if (contributionState.inFlight) return false
  contributionState.inFlight = true
  contributionState.status = 'submitting'
  worldState.version++
  try {
    const playerId = identityResolver()
    if (!playerId) throw new Error('no_identity')
    const count = await worldState.provider.contribute(playerId)
    applyWorldState(count)
    worldState.lastContributionAt = Date.now()
    contributionState.status = 'success'
    worldState.version++
    return true
  } catch {
    contributionState.status = 'error'
    contributionState.lastErrorAt = Date.now()
    worldState.version++
    return false
  } finally {
    contributionState.inFlight = false
  }
}

// Scene-side stage helper: contribution count -> stage index.
// The canonical stage logic lives in shared/world-state.ts.
export const stageFor = stageIndexFor
