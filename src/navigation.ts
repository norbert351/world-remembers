// Navigation descriptor. Pure + engine-free: turns current expedition state
// and the player's position into "where do I go next and how far". The UI reads
// this each render (the UI reconciler re-renders per frame, and the player
// position is refreshed on the 0.5s proximity tick). Nothing here mutates
// globals, so it is trivially testable in node.
import { expeditionCompleted, expeditionFragments, expeditionState } from './expedition'
import { fragmentLocation } from '../shared/expedition'
import { realmById, realmWorld } from '../shared/realms'

export interface NextTarget {
  hasTarget: boolean
  name: string
  kind: 'fragment' | 'shrine'
  distance: number
}

export function describeNextTarget(player?: { x: number; z: number } | null): NextTarget {
  const none: NextTarget = { hasTarget: false, name: '', kind: 'fragment', distance: 0 }
  const frags = expeditionFragments()
  if (!player || frags.length === 0 || expeditionCompleted()) return none

  const realm = expeditionState.state?.realm ? realmById(expeditionState.state.realm.id) : undefined
  const next = frags.find((f) => !f.collected)

  let pos: { x: number; z: number } | null = null
  let name = ''
  let kind: NextTarget['kind'] = 'fragment'
  if (next) {
    pos = fragmentLocation(next.id) ?? null
    name = realm?.name ?? 'Memory'
    kind = 'fragment'
  } else if (realm) {
    pos = realmWorld(realm, realm.shrine.local)
    name = realm.name
    kind = 'shrine'
  }
  if (!pos) return none

  return {
    hasTarget: true,
    name,
    kind,
    distance: Math.round(Math.hypot(player.x - pos.x, player.z - pos.z))
  }
}

// --- simple direction (closer / away) -------------------------------------

export type Approach = 'closer' | 'away' | 'steady'

// Pure. Compares the previous distance to the current one. A negative delta
// (distance shrank) means the player is getting closer. A small change is
// treated as steady so the UI doesn't flicker on jitter.
export function approachFor(prev: number | null, cur: number, threshold = 2): Approach {
  if (prev === null || !Number.isFinite(prev)) return 'steady'
  const delta = prev - cur
  if (delta > threshold) return 'closer'
  if (delta < -threshold) return 'away'
  return 'steady'
}

// The active objective's last-known distance, tracked here so the low-
// frequency proximity tick can compare across samples. Engine-free.
let lastNavDistance: number | null = null
let lastNavApproach: Approach = 'steady'

// Feed a fresh distance sample (the scene calls this on the 0.5s proximity
// tick). Stores the previous distance and updates the approach reading.
export function tickNavDirection(distance: number): Approach {
  lastNavApproach = approachFor(lastNavDistance, distance)
  lastNavDistance = distance
  return lastNavApproach
}

export function navApproach(): Approach {
  return lastNavApproach
}

export function resetNavDirection(): void {
  lastNavDistance = null
  lastNavApproach = 'steady'
}
