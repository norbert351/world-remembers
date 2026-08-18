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
