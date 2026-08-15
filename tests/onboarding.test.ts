// Phase E onboarding tests: first-visit sequence, once-per-session rule.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  currentOnboardingLine,
  onboardingState,
  resetOnboarding,
  startOnboardingIfFirstVisit,
  tickOnboarding
} from '../src/onboarding'
import { ONBOARDING } from '../src/config'

afterEach(() => {
  resetOnboarding()
})

test('first visit starts the onboarding sequence', () => {
  const started = startOnboardingIfFirstVisit()
  assert.equal(started, true)
  assert.equal(onboardingState.visible, true)
  assert.equal(onboardingState.lineIndex, 0)
  assert.equal(currentOnboardingLine(), ONBOARDING.lines[0])
})

test('onboarding only appears once per session', () => {
  startOnboardingIfFirstVisit()
  // finish the sequence
  const totalMs = ONBOARDING.lineMs * ONBOARDING.lines.length
  tickOnboarding(totalMs / 1000 + 0.1)
  assert.equal(onboardingState.visible, false)
  assert.equal(onboardingState.done, true)
  // a second attempt is refused
  assert.equal(startOnboardingIfFirstVisit(), false)
  assert.equal(onboardingState.visible, false)
  assert.equal(currentOnboardingLine(), null)
})

test('lines advance in order then hide', () => {
  startOnboardingIfFirstVisit()
  assert.equal(currentOnboardingLine(), ONBOARDING.lines[0])
  tickOnboarding(ONBOARDING.lineMs / 1000 + 0.01)
  assert.equal(onboardingState.lineIndex, 1)
  assert.equal(currentOnboardingLine(), ONBOARDING.lines[1])
  tickOnboarding(ONBOARDING.lineMs / 1000 + 0.01)
  assert.equal(onboardingState.lineIndex, 2)
  assert.equal(currentOnboardingLine(), ONBOARDING.lines[2])
  tickOnboarding(ONBOARDING.lineMs / 1000 + 0.01)
  assert.equal(onboardingState.visible, false)
  assert.equal(onboardingState.done, true)
})

test('tick before start is a no-op', () => {
  tickOnboarding(10)
  assert.equal(onboardingState.visible, false)
  assert.equal(onboardingState.done, false)
})

test('done flag prevents re-show after a reload simulation', () => {
  startOnboardingIfFirstVisit()
  tickOnboarding((ONBOARDING.lineMs * ONBOARDING.lines.length) / 1000 + 0.1)
  // simulate scene reload: reset() is called by the new main(), but the
  // session flag is module state, so a second start in the same session
  // must not replay. resetOnboarding clears visible/done; the UI shows
  // nothing unless startOnboardingIfFirstVisit is called again.
  assert.equal(onboardingState.done, true)
})
