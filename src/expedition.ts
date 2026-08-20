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
  // why the last dispel failed: 'timeout' | 'network' | 'server' | null
  lastDispelError: null as 'timeout' | 'network' | 'server' | null,
  // bump on every change so the UI re-renders fresh values
  version: 0,
  provider: new LocalExpeditionProvider() as ExpeditionProvider
}

// Interaction targets carry a display prefix (guardian-<fragId>, fragment-<fragId>,
// rare-<fragId>) that is NOT the server's fragment id. Every client action must
// strip the prefix so the server receives the exact fragment id, otherwise it
// rejects the request (invalid_fragment) and DISPEL can never succeed.
const INTERACTION_PREFIXES = ['guardian-', 'fragment-', 'rare-']
export function normalizeFragmentId(id: string): string {
  for (const p of INTERACTION_PREFIXES) {
    if (id.startsWith(p)) return id.slice(p.length)
  }
  return id
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

// Guaranteed timeout so a hung backend can never leave the scene stuck at
// "DISPELLING...". Type-safe for the scene runtime (no DOM AbortSignal): a
// Promise.race keeps the in-flight lock from blocking forever, and the
// finally-block below always releases it (in DISPENSING of outcome).
const DISPEL_TIMEOUT_MS = 8000
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dispel_timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

export async function dispelGuardian(fragmentId: ExpeditionFragmentId): Promise<boolean> {
  // reject a second tap while a dispel is already on the wire
  if (dispelInFlight || expeditionState.loading) return false
  // normalize away any interaction-target prefix (guardian- / fragment- / rare-)
  const realId = normalizeFragmentId(fragmentId)
  if (!realId) return false
  dispelInFlight = true
  bump()
  console.log('[EXPEDITION] dispel attempt', realId)
  try {
    applyExpedition(await withTimeout(expeditionState.provider.dispel(realId), DISPEL_TIMEOUT_MS))
    expeditionState.lastDispelAt = Date.now()
    expeditionState.lastDispelFragment = realId
    expeditionState.dispelError = false
    expeditionState.lastDispelError = null
    console.log('[EXPEDITION] guardian progress', realId, `${expeditionHits(realId)}/3`)
    if (expeditionHits(realId) >= 3) console.log('[EXPEDITION] guardian defeated, fragment revealed', realId)
    return true
  } catch (e) {
    expeditionState.dispelError = true
    const msg = (e as Error | undefined)?.message
    const name = (e as Error | undefined)?.name
    expeditionState.lastDispelError = msg === 'dispel_timeout' || name === 'AbortError' ? 'timeout' : 'network'
    bump()
    console.log('[EXPEDITION] server response rejected', realId, name, msg)
    return false
  } finally {
    // the interaction lock MUST always be released (also on timeout)
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
  const realId = normalizeFragmentId(fragmentId)
  if (!realId) return false
  try {
    applyExpedition(await expeditionState.provider.collect(realId))
    expeditionState.lastCollectAt = Date.now()
    expeditionState.lastCollectFragment = realId
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
