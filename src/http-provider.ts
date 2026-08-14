// HTTP world state provider: talks to the World API over HTTPS.
// All networking lives here. Gameplay depends on WorldStateProvider, never
// on fetch directly.
import type { WorldStateProvider } from './state'

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
    private readonly fetchImpl: typeof fetch = fetch
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
    return parseContribute(await res.json())
  }
}
