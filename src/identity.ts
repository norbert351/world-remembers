// Player identity. The DCL client exposes the session identity through
// getPlayer() with no wallet prompts and no signatures. For connected
// players it is the wallet address in lowercase, for guests a generated
// address. Both match the API's validated 0x + 40 hex format.
import { getPlayer } from '@dcl/sdk/players'

let cached: string | null = null

export function getPlayerIdentity(): string | null {
  if (cached) return cached
  try {
    const p = getPlayer()
    if (p && p.userId) cached = p.userId
  } catch {
    cached = null
  }
  return cached
}
