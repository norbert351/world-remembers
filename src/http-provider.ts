// HTTP world state provider: talks to the World API over HTTPS.
// All networking lives here. Gameplay depends on WorldStateProvider, never
// on fetch directly.
import type { StoneDetail, StoneProvider, StoneSummary } from './stone-state'
import type { WorldStateProvider } from './state'
import type { MissionProvider } from './mission'
import type { ExpeditionProvider } from './expedition'
import { parseLivingWorld, type LivingWorldState, type LocationMemoriesResponse } from './living-world'
import { isReactionId, isStoneId, REACTIONS, type ReactionId } from '../shared/stones'
import { missionFromServer, type MissionState } from '../shared/mission'
import { expeditionFromServer, type ExpeditionFragmentId, type ExpeditionState } from '../shared/expedition'

// Parse and validate the /world response. A malformed payload must throw,
// never corrupt the scene state.
export function parseWorldState(body: unknown): number {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('bad_world_state')
  }
  const c = (body as Record<string, unknown>).contributions
  if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) {
    throw new Error('bad_world_state')
  }
  return c
}

// Parse and validate the /contribute response. success must be true.
export function parseContribute(body: unknown): number {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('bad_contribute')
  }
  const b = body as Record<string, unknown>
  if (b.success !== true) {
    throw new Error('contribute_rejected')
  }
  const c = b.contributions
  if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) {
    throw new Error('bad_contribute')
  }
  return c
}

export class HttpWorldStateProvider implements WorldStateProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    // optional: receives the mission payload embedded in /contribute
    // responses, so the scene updates mission progress with the same
    // round trip (no extra API call)
    private readonly onMission?: (mission: MissionState | null) => void
  ) {}

  async load(): Promise<number> {
    const res = await this.fetchImpl(`${this.baseUrl}/world`)
    if (!res.ok) throw new Error(`world_http_${res.status}`)
    return parseWorldState(await res.json())
  }

  async contribute(playerId: string): Promise<number> {
    const res = await this.fetchImpl(`${this.baseUrl}/contribute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId })
    })
    if (!res.ok) throw new Error(`contribute_http_${res.status}`)
    const body = await res.json()
    this.onMission?.(parseEmbeddedMission(body))
    return parseContribute(body)
  }
}

// --- Mission ---------------------------------------------------------------

export class HttpMissionProvider implements MissionProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async load(): Promise<MissionState> {
    const res = await this.fetchImpl(`${this.baseUrl}/mission`)
    if (!res.ok) throw new Error(`mission_http_${res.status}`)
    return missionFromServer(await res.json())
  }
}

// Parse the optional mission block on /contribute and stone-memory responses.
// Returns null when absent (older server) — the scene stays playable.
export function parseEmbeddedMission(body: unknown): MissionState | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (b.mission === undefined || b.mission === null) return null
  return missionFromServer(b)
}

// --- Expedition -------------------------------------------------------------

export class HttpExpeditionProvider implements ExpeditionProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly playerId: () => string | null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private auth(): string {
    const id = this.playerId()
    if (!id) throw new Error('no_identity')
    return id
  }

  async load(): Promise<ExpeditionState> {
    const id = this.auth()
    const res = await this.fetchImpl(`${this.baseUrl}/expedition?playerId=${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`expedition_http_${res.status}`)
    return expeditionFromServer(await res.json())
  }

  // POST the action, then re-fetch the authoritative state in the SAME call
  // (one response is discarded, never two).
  private async action(path: string, fragmentId?: ExpeditionFragmentId): Promise<ExpeditionState> {
    const id = this.auth()
    const body: Record<string, string> = { playerId: id }
    if (fragmentId) body.fragmentId = fragmentId
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`expedition_http_${res.status}`)
    return this.load()
  }

  async dispel(fragmentId: ExpeditionFragmentId): Promise<ExpeditionState> {
    return this.action('/expedition/dispel', fragmentId)
  }

  async collect(fragmentId: ExpeditionFragmentId): Promise<ExpeditionState> {
    return this.action('/expedition/collect', fragmentId)
  }

  async complete(): Promise<ExpeditionState> {
    return this.action('/expedition/complete')
  }
}

// --- Living World (Phase F+G) -----------------------------------------------

export class HttpLivingWorldProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly playerId: () => string | null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private auth(): string {
    const id = this.playerId()
    if (!id) throw new Error('no_identity')
    return id
  }

  // the living-world block rides on GET /world (already fetched by the
  // world provider); this is a dedicated read for the scene's own sync
  async load(): Promise<LivingWorldState> {
    const id = this.auth()
    const res = await this.fetchImpl(`${this.baseUrl}/world?playerId=${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error(`world_http_${res.status}`)
    return parseLivingWorld(await res.json())
  }

  // G4: leave a reaction at an expedition location
  async leaveLocationMemory(locationId: string, reaction: string): Promise<LocationMemoriesResponse> {
    const id = this.auth()
    const res = await this.fetchImpl(`${this.baseUrl}/locations/${locationId}/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: id, reaction })
    })
    if (res.status === 409) throw new Error('already_remembered')
    if (!res.ok) throw new Error(`location_memory_http_${res.status}`)
    const body = (await res.json()) as Record<string, unknown>
    return {
      locationId,
      memories: Array.isArray(body.memories) ? (body.memories as LocationMemoriesResponse['memories']) : [],
      memoryCount: typeof body.memoryCount === 'number' ? body.memoryCount : 0
    }
  }

  // G5: claim today's rare memory (first explorer wins)
  async discoverRare(locationId: string): Promise<boolean> {
    const id = this.auth()
    const res = await this.fetchImpl(`${this.baseUrl}/world/discover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: id, fragmentId: locationId })
    })
    if (res.status === 409) return false // already discovered by someone
    if (!res.ok) throw new Error(`discover_http_${res.status}`)
    return true
  }
}

// --- Memory Stones ---------------------------------------------------------

// Parse and validate the GET /stones response. Every stone must have a
// known id and a non-negative integer count.
export function parseStones(body: unknown): StoneSummary[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('bad_stones')
  }
  const stones = (body as Record<string, unknown>).stones
  if (!Array.isArray(stones)) throw new Error('bad_stones')
  return stones.map((s) => {
    if (typeof s !== 'object' || s === null) throw new Error('bad_stones')
    const rec = s as Record<string, unknown>
    if (typeof rec.id !== 'string' || !isStoneId(rec.id)) throw new Error('bad_stones')
    const c = rec.memoryCount
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) throw new Error('bad_stones')
    return { id: rec.id, memoryCount: c }
  })
}

// Parse and validate the GET /stones/:id response.
export function parseStoneDetail(body: unknown): StoneDetail {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('bad_stone_detail')
  }
  const b = body as Record<string, unknown>
  const stone = b.stone as Record<string, unknown> | null
  if (typeof stone !== 'object' || stone === null) throw new Error('bad_stone_detail')
  const id = stone.id
  const count = stone.memoryCount
  if (typeof id !== 'string' || !isStoneId(id)) throw new Error('bad_stone_detail')
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('bad_stone_detail')
  }
  const memoriesRaw = b.memories
  if (!Array.isArray(memoriesRaw)) throw new Error('bad_stone_detail')
  const parsed = memoriesRaw.map((m) => parseMemory(m))
  return { id, memoryCount: count, memories: parsed }
}

function parseMemory(m: unknown): { playerId: string; reaction: ReactionId; createdAt: string } {
  if (typeof m !== 'object' || m === null) throw new Error('bad_stone_detail')
  const rec = m as Record<string, unknown>
  if (typeof rec.playerId !== 'string') throw new Error('bad_stone_detail')
  if (!isReactionId(rec.reaction)) throw new Error('bad_stone_detail')
  if (typeof rec.createdAt !== 'string') throw new Error('bad_stone_detail')
  return { playerId: rec.playerId, reaction: rec.reaction, createdAt: rec.createdAt }
}

export class HttpStoneProvider implements StoneProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    // optional: receives the mission payload embedded in memory responses
    private readonly onMission?: (mission: MissionState | null) => void
  ) {}

  async listStones(): Promise<StoneSummary[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/stones`)
    if (!res.ok) throw new Error(`stones_http_${res.status}`)
    return parseStones(await res.json())
  }

  async loadStone(stoneId: string): Promise<StoneDetail> {
    const res = await this.fetchImpl(`${this.baseUrl}/stones/${encodeURIComponent(stoneId)}`)
    if (!res.ok) throw new Error(`stone_http_${res.status}`)
    return parseStoneDetail(await res.json())
  }

  async leaveMemory(stoneId: string, playerId: string, reaction: ReactionId): Promise<StoneDetail> {
    const res = await this.fetchImpl(`${this.baseUrl}/stones/${encodeURIComponent(stoneId)}/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, reaction })
    })
    if (res.status === 409) {
      // the server keeps the player's first memory; surface it as a known
      // error so the scene can show the stored reaction
      throw new Error('already_left_memory')
    }
    if (!res.ok) throw new Error(`memory_http_${res.status}`)
    const body = (await res.json()) as Record<string, unknown> | null
    if (typeof body !== 'object' || body === null || body.success !== true) {
      throw new Error('bad_memory_response')
    }
    this.onMission?.(parseEmbeddedMission(body))
    return parseStoneDetail({ stone: { id: stoneId, memoryCount: body.memoryCount }, memories: body.memories })
  }
}

// reaction label lookup for the UI: emoji + text from the shared whitelist
export function reactionInfo(id: ReactionId): { emoji: string; label: string } {
  const r = REACTIONS.find((x) => x.id === id)
  return r ? { emoji: r.emoji, label: r.label } : { emoji: '·', label: id }
}
