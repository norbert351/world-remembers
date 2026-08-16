// Living world client state (Phase F+G): memory level, landmark stage,
// daily pulse, rare memory, location memories. Server-derived; the client
// renders only what the server returns.
import { getPlayerIdentity } from './identity'

export interface LivingWorldState {
  memoryLevel: { level: number; name: string; score: number }
  landmark: { stage: number; name: string }
  dailyEvent: { day: string; pulse: boolean }
  rareMemory: { locationId: string; discovered: boolean }
  communityActivity: { contributions: number; stoneMemories: number; completedExpeditions: number }
}

export interface LocationMemoryState {
  playerId: string
  reaction: string
  createdAt: string
}

export interface LocationMemoriesResponse {
  locationId: string
  memories: LocationMemoryState[]
  memoryCount: number
}

// Strict validator for the living-world block of GET /world.
export function parseLivingWorld(body: unknown): LivingWorldState {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('bad_living_world')
  const b = body as Record<string, unknown>
  const ml = b.memoryLevel
  const lm = b.landmark
  const de = b.dailyEvent
  const rm = b.rareMemory
  const ca = b.communityActivity
  if (typeof ml !== 'object' || ml === null) throw new Error('bad_living_world')
  if (typeof lm !== 'object' || lm === null) throw new Error('bad_living_world')
  if (typeof de !== 'object' || de === null) throw new Error('bad_living_world')
  if (typeof rm !== 'object' || rm === null) throw new Error('bad_living_world')
  if (typeof ca !== 'object' || ca === null) throw new Error('bad_living_world')
  const mlr = ml as Record<string, unknown>
  const lmr = lm as Record<string, unknown>
  const der = de as Record<string, unknown>
  const rmr = rm as Record<string, unknown>
  const car = ca as Record<string, unknown>
  if (typeof mlr.level !== 'number' || typeof mlr.name !== 'string') throw new Error('bad_living_world')
  if (typeof lmr.stage !== 'number' || typeof lmr.name !== 'string') throw new Error('bad_living_world')
  if (typeof der.day !== 'string' || typeof der.pulse !== 'boolean') throw new Error('bad_living_world')
  if (typeof rmr.locationId !== 'string' || typeof rmr.discovered !== 'boolean') throw new Error('bad_living_world')
  if (
    typeof car.contributions !== 'number' ||
    typeof car.stoneMemories !== 'number' ||
    typeof car.completedExpeditions !== 'number'
  ) {
    throw new Error('bad_living_world')
  }
  return {
    memoryLevel: { level: mlr.level, name: mlr.name, score: typeof mlr.score === 'number' ? mlr.score : 0 },
    landmark: { stage: lmr.stage, name: lmr.name },
    dailyEvent: { day: der.day, pulse: der.pulse },
    rareMemory: { locationId: rmr.locationId, discovered: rmr.discovered },
    communityActivity: {
      contributions: car.contributions,
      stoneMemories: car.stoneMemories,
      completedExpeditions: car.completedExpeditions
    }
  }
}

export const livingWorldState = {
  state: null as LivingWorldState | null,
  loaded: false,
  loading: false,
  loadError: false,
  // transient: when the current player discovered the rare memory
  rareDiscoveredAt: 0,
  rareError: false,
  version: 0,
  provider: null as {
    load(): Promise<LivingWorldState>
    leaveLocationMemory(locationId: string, reaction: string): Promise<LocationMemoriesResponse>
    discoverRare(locationId: string): Promise<boolean>
  } | null
}

let identityResolver: () => string | null = getPlayerIdentity
export function setLivingIdentityResolver(fn?: () => string | null): void {
  identityResolver = fn ?? getPlayerIdentity
}

function bump(): void {
  livingWorldState.version++
}

export function applyLivingWorld(state: LivingWorldState): void {
  livingWorldState.state = state
  livingWorldState.loaded = true
  livingWorldState.loadError = false
  bump()
}

// Initial sync: GET /world living-world block. Scene stays fully playable
// offline; the world simply keeps its current visuals.
export async function loadLivingWorld(): Promise<boolean> {
  if (!livingWorldState.provider) return false
  if (livingWorldState.loading) return livingWorldState.loaded
  livingWorldState.loading = true
  bump()
  try {
    applyLivingWorld(await livingWorldState.provider.load())
    return true
  } catch {
    livingWorldState.loadError = true
    bump()
    return false
  } finally {
    livingWorldState.loading = false
  }
}

// G5: claim today's rare memory. Returns true if THIS player discovered it.
export async function discoverRareMemory(locationId: string): Promise<boolean> {
  if (!livingWorldState.provider) return false
  try {
    const won = await livingWorldState.provider.discoverRare(locationId)
    if (won) {
      livingWorldState.rareDiscoveredAt = Date.now()
      // refresh the world state to reflect the discovery
      await loadLivingWorld()
    }
    livingWorldState.rareError = false
    return won
  } catch {
    livingWorldState.rareError = true
    bump()
    return false
  }
}

export function livingMemoryLevel(): number {
  return livingWorldState.state?.memoryLevel.level ?? 1
}

export function livingMemoryLevelName(): string {
  return livingWorldState.state?.memoryLevel.name ?? 'THE SLEEPING WORLD'
}

export function livingLandmarkStage(): number {
  return livingWorldState.state?.landmark.stage ?? 1
}

export function livingDailyPulse(): boolean {
  return livingWorldState.state?.dailyEvent.pulse ?? false
}

export function livingRareLocation(): string | null {
  return livingWorldState.state?.rareMemory.locationId ?? null
}

export function livingRareDiscovered(): boolean {
  return livingWorldState.state?.rareMemory.discovered ?? false
}

export function livingCommunityActivity(): { contributions: number; stoneMemories: number; completedExpeditions: number } {
  return (
    livingWorldState.state?.communityActivity ?? { contributions: 0, stoneMemories: 0, completedExpeditions: 0 }
  )
}

export function resetLivingWorld(): void {
  livingWorldState.state = null
  livingWorldState.loaded = false
  livingWorldState.loading = false
  livingWorldState.loadError = false
  livingWorldState.rareDiscoveredAt = 0
  livingWorldState.rareError = false
  livingWorldState.version++
}
