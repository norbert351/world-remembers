// Contextual interaction manager. One CTA at a time, chosen by priority and
// proximity. The scene feeds player positions at a low frequency (a 0.5s
// system tick, never per-frame); the UI renders whatever target is active.
//
// Priority order (highest first):
//   1. current mission objective (the tree while the mission is active)
//   2. Memory Tree
//   3. Memory Stone
//   4. future interactables
// Within the same priority the nearest target wins.
import { TREE } from './config'
import { STONES } from './config'

export type InteractionType = 'mission' | 'tree' | 'stone' | 'guardian' | 'fragment'

export interface InteractionTarget {
  id: string
  type: InteractionType
  position: { x: number; z: number }
  radius: number
  label: string
  hint: string
  priority: number
  enabled: boolean
}

export interface InteractionState {
  // the single active target, null when nothing is in range
  target: InteractionTarget | null
  // last known player position, for tests and debug
  player: { x: number; z: number } | null
  // bump on every change so the UI re-renders only on transitions
  version: number
}

export const interactionState: InteractionState = {
  target: null,
  player: null,
  version: 0
}

// Configurable in one place. The tree gets a wide radius (it is the hero),
// stones a tighter one (tapping them is a deliberate act).
export const TREE_INTERACTION_RADIUS = 6
export const STONE_INTERACTION_RADIUS = 4.5
export const EXPEDITION_INTERACTION_RADIUS = 5

// Expedition sites are added by the scene after the expedition loads:
// guardians (priority 1, the active objective) and revealed fragments
// (priority 1 too — both are "the current mission objective").
export function addExpeditionTarget(target: InteractionTarget): void {
  extraTargets.push(target)
}

export function clearExpeditionTargets(): void {
  extraTargets.length = 0
}

const extraTargets: InteractionTarget[] = []

// Builds the target list once. Mission objective (the tree) is enabled only
// while the mission is active and not completed; the tree itself stays
// interactable regardless.
export function buildTargets(opts: { missionActive: boolean; missionCompleted: boolean }): InteractionTarget[] {
  const targets: InteractionTarget[] = [
    {
      id: 'tree',
      type: 'tree',
      position: { x: TREE.position.x, z: TREE.position.z },
      radius: TREE_INTERACTION_RADIUS,
      label: 'HELP THE TREE GROW',
      hint: 'Tap to contribute',
      priority: opts.missionActive && !opts.missionCompleted ? 1 : 2,
      enabled: true
    }
  ]
  for (const s of STONES) {
    targets.push({
      id: s.id,
      type: 'stone',
      position: { x: s.position.x, z: s.position.z },
      radius: STONE_INTERACTION_RADIUS,
      label: 'LEAVE A MEMORY',
      hint: 'Tap to read who was here',
      priority: 3,
      enabled: true
    })
  }
  // expedition sites sit at priority 1 while active: dispelling a guardian
  // or collecting a revealed fragment is the current objective
  for (const t of extraTargets) {
    targets.push(t)
  }
  return targets
}

function distance2(px: number, pz: number, tx: number, tz: number): number {
  const dx = px - tx
  const dz = pz - tz
  return dx * dx + dz * dz
}

// Recompute the active target from the player position. Event-driven: the
// caller decides when (proximity system tick, mission state change). Only
// bumps the version when the target actually changes.
export function updateInteraction(
  player: { x: number; z: number },
  targets: InteractionTarget[]
): InteractionTarget | null {
  interactionState.player = player
  let best: InteractionTarget | null = null
  let bestPriority = Infinity
  let bestDist = Infinity
  for (const t of targets) {
    if (!t.enabled) continue
    const d = distance2(player.x, player.z, t.position.x, t.position.z)
    if (d > t.radius * t.radius) continue
    // priority wins; within the same priority the nearest wins
    if (t.priority < bestPriority || (t.priority === bestPriority && d < bestDist)) {
      best = t
      bestPriority = t.priority
      bestDist = d
    }
  }
  if (best?.id !== interactionState.target?.id) {
    interactionState.target = best
    interactionState.version++
  }
  return best
}

export function clearInteraction(): void {
  if (interactionState.target !== null) {
    interactionState.target = null
    interactionState.version++
  }
}

export function resetInteraction(): void {
  interactionState.target = null
  interactionState.player = null
  interactionState.version++
}

// Test helper: distance between two points
export function distanceBetween(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(distance2(ax, az, bx, bz))
}
