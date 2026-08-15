// First-visit onboarding. Three short lines shown once per session as a
// non-blocking overlay. SDK7 has no client-side persistent storage, so the
// flag is session-scoped (the backend remains the only cross-session truth).
// Pure state: the UI reads onboardingState, the scene drives it with
// startOnboardingIfFirstVisit().
import { ONBOARDING } from './config'

export interface OnboardingState {
  // true while the overlay is visible (line 1..3, then done)
  visible: boolean
  // index of the current line, 0-based
  lineIndex: number
  // true once the sequence finished this session; never shown again
  done: boolean
  // seconds until the next line (or hide)
  timeLeft: number
}

function fresh(): OnboardingState {
  return {
    visible: false,
    lineIndex: 0,
    done: false,
    timeLeft: ONBOARDING.lineMs / 1000
  }
}

export const onboardingState: OnboardingState = fresh()

export function resetOnboarding(): void {
  Object.assign(onboardingState, fresh())
}

// Start the sequence if this is the first visit this session.
// Returns true when the overlay began showing.
export function startOnboardingIfFirstVisit(): boolean {
  if (onboardingState.done) return false
  if (!ONBOARDING.enabled) {
    onboardingState.done = true
    return false
  }
  onboardingState.visible = true
  onboardingState.lineIndex = 0
  onboardingState.timeLeft = ONBOARDING.lineMs / 1000
  return true
}

// Advance the sequence by dt seconds. Call every frame from the scene.
// Each line holds for lineMs, then the next appears; after the last line
// the overlay hides and done is set. Leftover time carries between lines,
// so a large dt advances the whole sequence.
export function tickOnboarding(dt: number): void {
  if (!onboardingState.visible) return
  let remaining = dt
  while (onboardingState.visible && remaining > 0) {
    onboardingState.timeLeft -= remaining
    if (onboardingState.timeLeft > 0) {
      remaining = 0
      break
    }
    remaining = -onboardingState.timeLeft
    if (onboardingState.lineIndex < ONBOARDING.lines.length - 1) {
      onboardingState.lineIndex++
      onboardingState.timeLeft = ONBOARDING.lineMs / 1000
    } else {
      onboardingState.visible = false
      onboardingState.done = true
    }
  }
}

// current line to display, or null when hidden
export function currentOnboardingLine(): string | null {
  if (!onboardingState.visible) return null
  return ONBOARDING.lines[onboardingState.lineIndex] ?? null
}
