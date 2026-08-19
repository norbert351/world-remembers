// Memory Expedition client state. Mirrors mission.ts: the server is
// authoritative, the client applies validated payloads and never decides
// collection or completion locally.
import { expeditionFromServer, type ExpeditionFragmentId, type ExpeditionState } from '../shared/expedition'
import { getPlayerIdentity } from './identity'

export interface ExpeditionProvider {
  load(): Promise<ExpeditionState>
  dispel(fragmentId: ExpeditionFragmentId): Promise<ExpeditionState>
  collect(fragmentId: ExpeditionFragmentId): Promise<ExpeditionState>
  complete(): Promise<ExpeditionState>
}

class LocalExpeditionProvider implements ExpeditionProvider {
  async load(): Promise<ExpeditionState> {
    throw new Error('no_local_expedition')
  }
  async dispel(): Promise<ExpeditionState> {
    throw new Error('no_local_expedition')
  }
  async collect(): Promise<ExpeditionState> {
    throw new Error('no_local_expedition')
  }
  async complete(): Promise<ExpeditionState> {
    throw new Error('no_local_expedition')
  }
}

export const expeditionState = {
  state: null as ExpeditionState | null,
  loaded: false,
  loading: false,
  loadError: false,
  // transient UI feedback
  lastDispelAt: 0,
  lastDispelFragment: null as ExpeditionFragmentId | null,
  lastCollectAt: 0,
  lastCollectFragment: null as ExpeditionFragmentId | null,
  lastCompleteAt: 0,
  dispelError: false,
  // bump on every change so the UI re-renders fresh values
  version: 0,
  provider: new LocalExpeditionProvider() as ExpeditionProvider
}

// Identity comes from the same DCL session resolver as everywhere else.
let identityResolver: () => string | null = getPlayerIdentity
export function setExpeditionIdentityResolver(fn?: () => string | null): void {
  identityResolver = fn ?? getPlayerIdentity
}

function bump(): void {
  expeditionState.version++
}

export function applyExpedition(state: ExpeditionState): void {
  expeditionState.state = state
  expeditionState.loaded = true
  expeditionState.loadError = false
  bump()
}

// Initial sync: GET /expedition. The scene stays fully playable if the API
// is unreachable — no fragments, no expedition, no false state.
export async function loadExpedition(): Promise<boolean> {
  if (expeditionState.loading) return expeditionState.loaded
  expeditionState.loading = true
  bump()
  try {
    applyExpedition(await expeditionState.provider.load())
    return true
  } catch {
    expeditionState.loadError = true
    bump()
    return false
  } finally {
    expeditionState.loading = false
  }
}

// One dispel hit against a fragment's guardian. Only the server's response
// is applied; a failed request never touches local state. This is the ONE
// canonical dispel action — the world tap, the UI button, and the card all
// call it, and an in-flight guard guarantees exactly one request per tap.
let dispelInFlight = false

export function dispelInFlightNow(): boolean {
  return dispelInFlight
}

export async function dispelGuardian(fragmentId: ExpeditionFragmentId): Promise<boolean> {
  // reject a second tap while a dispel is already on the wire
  if (dispelInFlight || expeditionState.loading) return false
  if (!fragmentId) return false
  dispelInFlight = true
  bump()
  console.log('[EXPEDITION] dispel attempt', fragmentId)
  try {
    applyExpedition(await expeditionState.provider.dispel(fragmentId))
    expeditionState.lastDispelAt = Date.now()
    expeditionState.lastDispelFragment = fragmentId
    expeditionState.dispelError = false
    console.log('[EXPEDITION] guardian progress', fragmentId, `${expeditionHits(fragmentId)}/3`)
    if (expeditionHits(fragmentId) >= 3) console.log('[EXPEDITION] guardian defeated, fragment revealed', fragmentId)
    return true
  } catch {
    expeditionState.dispelError = true
    bump()
    console.log('[EXPEDITION] server response rejected', fragmentId)
    return false
  } finally {
    dispelInFlight = false
  }
}

// Convenience: dispel the current uncollected objective (the one the mission
// card / beacon / trail all point at). Shared by the world tap and the UI.
export function dispelCurrentObjective(): boolean {
  const next = expeditionFragments().find((f) => !f.collected)
  if (!next) return false
  void dispelGuardian(next.id)
  return true
}

// Collect a fragment (guardian already cleared server-side).
export async function collectFragment(fragmentId: ExpeditionFragmentId): Promise<boolean> {
  if (expeditionState.loading) return false
  try {
    applyExpedition(await expeditionState.provider.collect(fragmentId))
    expeditionState.lastCollectAt = Date.now()
    expeditionState.lastCollectFragment = fragmentId
    return true
  } catch {
    expeditionState.dispelError = true
    bump()
    return false
  }
}

// Return all fragments to the tree.
export async function completeExpedition(): Promise<boolean> {
  if (expeditionState.loading) return false
  try {
    applyExpedition(await expeditionState.provider.complete())
    expeditionState.lastCompleteAt = Date.now()
    return true
  } catch {
    expeditionState.dispelError = true
    bump()
    return false
  }
}

// --- helpers for the scene and UI -------------------------------------------

export function expeditionFragments(): ExpeditionState['fragments'] {
  return expeditionState.state?.fragments ?? []
}

export function expeditionCollectedCount(): number {
  const f = expeditionState.state?.fragments ?? []
  return f.filter((x) => x.collected).length
}

export function expeditionCompleted(): boolean {
  return expeditionState.state?.completed ?? false
}

export function expeditionHits(fragmentId: ExpeditionFragmentId): number {
  const f = expeditionState.state?.fragments.find((x) => x.id === fragmentId)
  return f?.hits ?? 0
}

export function expeditionIsCollected(fragmentId: ExpeditionFragmentId): boolean {
  const f = expeditionState.state?.fragments.find((x) => x.id === fragmentId)
  return f?.collected ?? false
}

export function expeditionTodayCompletions(): number {
  return expeditionState.state?.todayCompletions ?? 0
}

export function resetExpedition(): void {
  expeditionState.state = null
  expeditionState.loaded = false
  expeditionState.loading = false
  expeditionState.loadError = false
  expeditionState.lastDispelAt = 0
  expeditionState.lastCollectAt = 0
  expeditionState.lastCompleteAt = 0
  expeditionState.dispelError = false
  expeditionState.version++
}
