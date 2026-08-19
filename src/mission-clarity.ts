// Mission clarity descriptor. Pure + engine-free: turns the current
// expedition + player state into the contextual mission-card copy and the
// guardian hit feedback. The UI renders exactly what this returns, so the
// card never shows a generic line while the game expects a different action.
//
// Hierarchy (WHAT -> WHERE -> HOW FAR -> WHAT TO DO):
//   TODAY'S MEMORY / Find 3 lost memories / 0 / 3
//   NEXT MEMORY / <REALM> / <distance>m
//   FOLLOW THE GOLD TRAIL ->
import {
  expeditionCollectedCount,
  expeditionCompleted,
  expeditionFragments,
  expeditionHits,
  expeditionIsCollected,
  expeditionState
} from './expedition'
import { describeNextTarget, navApproach, type Approach } from './navigation'
import { EXPEDITION } from '../shared/expedition'
import { realmById } from '../shared/realms'

export const NEAR_RADIUS = 16 // within this, the card switches to "next target"
export const MAX_MEMORIES = EXPEDITION.fragmentsPerDay // 3
export const GUARDIAN_HITS = EXPEDITION.guardianHits // 3

export type CardPhase =
  | 'loading' // expedition not loaded yet
  | 'enter' // not started: tells them to step into today's realm
  | 'searching' // far from the next objective
  | 'near' // close to the next objective / guardian cleared, collect
  | 'guardian' // at the objective, guardian present, dispel
  | 'return' // all 3 collected, restore at the shrine
  | 'restored' // expedition complete

export interface MissionCard {
  phase: CardPhase
  title: string // e.g. TODAY'S MEMORY
  objective: string // e.g. Find 3 lost memories
  progress: string // e.g. 1 / 3
  // WHERE + HOW FAR (omitted when not navigating)
  nextWhere: string
  howFar: number | null
  distanceLabel: string // e.g. '24m'
  // WHAT TO DO
  action: string
  // closer / away (updated on the 0.5s proximity tick)
  direction: Approach
  // concise instruction for first-time players (empty after the loop is known)
  hint: string
}

export function guardianHitMessage(hits: number): string {
  if (hits >= GUARDIAN_HITS) return 'MEMORY FREED ✨'
  if (hits >= GUARDIAN_HITS - 1) return 'ALMOST FREE · 1 MORE'
  if (hits >= 1) return 'GUARDIAN WEAKENED · 2 MORE'
  return 'TAP THE GUARDIAN TO DISPEL'
}

// next objective's realm short name, for WHERE
function realmName(): string {
  const id = expeditionState.state?.realm.id
  return id ? realmById(id)?.name?.replace(/^The /, '') ?? 'the realm' : 'the realm'
}

// The next uncollected fragment state (id + hits), or null when all done.
function nextFragment() {
  return expeditionFragments().find((f) => !f.collected) ?? null
}

export function describeMissionCard(
  player: { x: number; z: number } | null,
  started: boolean
): MissionCard {
  const none: MissionCard = {
    phase: 'loading',
    title: "TODAY'S MEMORY",
    objective: 'Find 3 lost memories',
    progress: '0 / 3',
    nextWhere: '',
    howFar: null,
    distanceLabel: '',
    action: '',
    direction: 'steady',
    hint: ''
  }
  if (!expeditionState.state) return none
  if (expeditionCompleted()) {
    return { ...none, phase: 'restored', title: 'MEMORY RESTORED', objective: 'The world remembers again.', progress: `${MAX_MEMORIES} / ${MAX_MEMORIES}`, action: 'A new memory appears tomorrow.' }
  }

  const collected = expeditionCollectedCount()
  const progress = `${collected} / ${MAX_MEMORIES}`

  // all memories collected -> return to restore
  if (collected >= MAX_MEMORIES) {
    const nav = describeNextTarget(player)
    return {
      phase: 'return',
      title: 'ALL MEMORIES FOUND ✨',
      objective: 'Return to the Memory Tree',
      progress,
      nextWhere: 'THE MEMORY TREE',
      howFar: nav.hasTarget ? nav.distance : null,
      distanceLabel: nav.hasTarget ? `${nav.distance}m` : '',
      action: 'RESTORE TODAY\u2019S MEMORY',
      direction: navApproach(),
      hint: 'Follow the trail back to restore the memories.'
    }
  }

  const next = nextFragment()
  if (!next) return none

  const howFar = player ? Math.round(Math.hypot(player.x - next.location.x, player.z - next.location.z)) : null
  const near = howFar !== null && howFar <= NEAR_RADIUS
  const guarded = !expeditionIsCollected(next.id) && expeditionHits(next.id) < GUARDIAN_HITS

  // not started / still at the hub gate
  if (!started) {
    return {
      phase: 'enter',
      title: "TODAY'S MEMORY",
      objective: 'Find 3 lost memories',
      progress,
      nextWhere: realmName(),
      howFar,
      distanceLabel: howFar !== null ? `${howFar}m` : '',
      action: 'ENTER THE REALM',
      direction: navApproach(),
      hint: 'Step through the glowing gate to begin.'
    }
  }

  // near the objective: guardian or collect phase
  if (near) {
    if (guarded) {
      return {
        phase: 'guardian',
        title: 'CORRUPTED MEMORY FOUND',
        objective: 'A guardian is protecting the memory.',
        progress,
        nextWhere: realmName(),
        howFar,
        distanceLabel: `${howFar}m`,
        action: guardianHitMessage(expeditionHits(next.id)),
        direction: navApproach(),
        hint: 'Tap DISPEL to weaken the guardian.'
      }
    }
    return {
      phase: 'near',
      title: 'MEMORY NEARBY',
      objective: 'A memory waits here.',
      progress,
      nextWhere: realmName(),
      howFar,
      distanceLabel: `${howFar}m`,
      action: 'LOOK FOR THE MEMORY BEACON',
      direction: navApproach(),
      hint: 'Find the glowing memory beacon.'
    }
  }

  // searching: far away, clear direction
  const directionNote = navApproach() === 'closer' ? 'GETTING CLOSER' : navApproach() === 'away' ? "YOU'RE MOVING AWAY" : ''
  return {
    phase: 'searching',
    title: "TODAY'S MEMORY",
    objective: 'Find the next lost memory',
    progress,
    nextWhere: realmName().toUpperCase(),
    howFar,
    distanceLabel: howFar !== null ? `${howFar}m` : '',
    action: 'FOLLOW THE GOLD TRAIL →',
    direction: navApproach(),
    hint: directionNote
  }
}
