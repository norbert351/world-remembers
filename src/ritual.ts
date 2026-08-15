// World Heartbeat / Memory Moment ritual. A pure state machine: the scene
// calls tickRitual(dt) each frame and registerRitualHooks(handlers) wires
// the visual responses. Keeping the machine engine-free makes it testable
// in node and guarantees the ritual cannot crash the scene.
import { RITUAL } from './config'
import { stoneState } from './stone-state'
import { worldState } from './state'

export type RitualPhase = 'idle' | 'quiet' | 'response' | 'sky' | 'complete'

export type RitualIntensity = 0 | 1 | 2

// Intensity from REAL state, deterministic:
// 0 low    : dormant tree, no memories
// 1 medium : any activity (tree awakened OR any stone memory)
// 2 high   : grown tree (250+) AND memories exist
export function ritualIntensity(contributions: number, treeStage: number, stoneMemories: number): RitualIntensity {
  const treeActive = treeStage >= 1 || contributions >= 100
  const grown = treeStage >= 2 || contributions >= 250
  if (treeActive && stoneMemories > 0) return grown ? 2 : 1
  if (treeActive || stoneMemories > 0) return 1
  return 0
}

export interface RitualHooks {
  // fired when a phase begins; visuals respond here
  onPhase: (phase: RitualPhase, intensity: RitualIntensity) => void
  // fired once when the ritual finishes; visuals clean up here
  onComplete: (intensity: RitualIntensity) => void
  // fired once when the ritual starts (before the quiet phase)
  onStart?: (intensity: RitualIntensity) => void
}

export interface RitualState {
  phase: RitualPhase
  intensity: RitualIntensity
  // seconds remaining in the current phase
  phaseTime: number
  // seconds until the next ritual may begin
  cooldown: number
  // how many rituals have completed this session
  completedCount: number
  // true while a ritual is running (quiet..complete)
  active: boolean
}

function freshState(): RitualState {
  return {
    phase: 'idle',
    intensity: 0,
    phaseTime: 0,
    cooldown: RITUAL.intervalSeconds,
    completedCount: 0,
    active: false
  }
}

export const ritualState: RitualState = freshState()

let hooks: RitualHooks = { onPhase: () => {}, onComplete: () => {} }

export function registerRitualHooks(h: RitualHooks): void {
  hooks = h
}

// current real-world activity for the next ritual
export function currentActivity(): { contributions: number; treeStage: number; stoneMemories: number } {
  const contributions = worldState.contributions
  const treeStage = worldState.contributions >= 500 ? 3 : worldState.contributions >= 250 ? 2 : worldState.contributions >= 100 ? 1 : 0
  const stoneMemories = stoneState.stones.reduce((acc, s) => acc + s.memoryCount, 0)
  return { contributions, treeStage, stoneMemories }
}

// Start a ritual now. No-op if one is already running (cannot overlap).
// Uses real world state for intensity. Returns true when started.
export function startRitual(): boolean {
  if (ritualState.active) return false
  const { contributions, treeStage, stoneMemories } = currentActivity()
  const intensity = ritualIntensity(contributions, treeStage, stoneMemories)
  ritualState.intensity = intensity
  ritualState.active = true
  ritualState.completedCount = 0 // reset per-run; incremented on complete
  ritualState.phase = 'quiet'
  ritualState.phaseTime = RITUAL.quiet
  hooks.onStart?.(intensity)
  hooks.onPhase('quiet', intensity)
  return true
}

// Force a ritual start with explicit state (tests, or a manual trigger).
export function startRitualWith(state: { contributions: number; treeStage: number; stoneMemories: number }): boolean {
  if (ritualState.active) return false
  const intensity = ritualIntensity(state.contributions, state.treeStage, state.stoneMemories)
  ritualState.intensity = intensity
  ritualState.active = true
  ritualState.phase = 'quiet'
  ritualState.phaseTime = RITUAL.quiet
  hooks.onStart?.(intensity)
  hooks.onPhase('quiet', intensity)
  return true
}

function durationOf(phase: RitualPhase): number {
  switch (phase) {
    case 'quiet':
      return RITUAL.quiet
    case 'response':
      return RITUAL.response
    case 'sky':
      return RITUAL.sky
    case 'complete':
      return RITUAL.complete
    default:
      return 0
  }
}

function nextPhase(p: RitualPhase): RitualPhase {
  switch (p) {
    case 'quiet':
      return 'response'
    case 'response':
      return 'sky'
    case 'sky':
      return 'complete'
    default:
      return 'idle'
  }
}

// Advance the machine by dt seconds. Call every frame from the scene.
// Handles multiple phase boundaries within one tick by looping: leftover
// time carries into the next phase, so a large dt never gets dropped.
export function tickRitual(dt: number): void {
  if (!ritualState.active) {
    // idle: count down the cooldown; when it hits zero the world remembers
    if (ritualState.cooldown > 0) {
      ritualState.cooldown -= dt
      if (ritualState.cooldown <= 0) {
        startRitual()
      }
    }
    return
  }

  let remaining = dt
  while (ritualState.active && remaining > 0) {
    ritualState.phaseTime -= remaining
    if (ritualState.phaseTime > 0) {
      remaining = 0
      break
    }
    // this phase ended; carry the leftover into the next one
    remaining = -ritualState.phaseTime
    const next = nextPhase(ritualState.phase)
    if (next === 'idle') {
      // ritual complete
      ritualState.active = false
      ritualState.phase = 'idle'
      ritualState.completedCount++
      ritualState.cooldown = RITUAL.intervalSeconds
      hooks.onComplete(ritualState.intensity)
      return
    }
    ritualState.phase = next
    ritualState.phaseTime = durationOf(next)
    hooks.onPhase(next, ritualState.intensity)
  }
}

// seconds until the next ritual (for tests/debug)
export function secondsUntilRitual(): number {
  return ritualState.active ? 0 : Math.max(0, ritualState.cooldown)
}

// reset the machine (scene reload)
export function resetRitual(): void {
  Object.assign(ritualState, freshState())
}
