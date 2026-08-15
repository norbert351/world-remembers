// The World Remembers — persistent Memory Tree + Memory Stones (Phases A-D)
// plus Phase E: world composition, onboarding and the World Heartbeat ritual.
// Enter, see the tree, tap, the server saves, the world remembers.
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { setupGarden } from './garden'
import { API, STAGES } from './config'
import { HttpStoneProvider } from './http-provider'
import { HttpWorldStateProvider } from './http-provider'
import { loadWorldState, setStateListener, worldState } from './state'
import { loadStones, setStoneIdentityResolver, stoneState } from './stone-state'
import { refreshStoneLabels, setupStones, stonePulseSystem, validateStoneConfig } from './stones'
import {
  applyCurrentStage,
  createHeartLight,
  createMemoryTree,
  moteOrbitSystem,
  pulseSystem
} from './tree'
import { setupUi } from './ui'
import { setupWorldComposition } from './composition'
import { currentOnboardingLine, onboardingState, startOnboardingIfFirstVisit, tickOnboarding } from './onboarding'
import { registerRitualHooks, ritualState, tickRitual } from './ritual'
import { cleanupRitualVisuals, ritualPhaseVisual, ritualVisualSystem } from './ritual-visuals'

export function main() {
  // fixed skybox so every visitor sees the stage mood consistently
  SkyboxTime.create(engine.RootEntity, { fixedTime: STAGES.skyTimes[0] })

  // the server is the source of truth for world state and stone memories
  worldState.provider = new HttpWorldStateProvider(API.baseUrl)
  stoneState.provider = new HttpStoneProvider(API.baseUrl)
  // stones use the same DCL session identity as contributions
  setStoneIdentityResolver()

  // every server-confirmed state change flows through applyWorldState and
  // lands here, so tree and world always move together
  setStateListener(() => applyCurrentStage())

  setupGarden()
  setupWorldComposition()
  createHeartLight()
  createMemoryTree()
  if (validateStoneConfig()) {
    setupStones()
  }
  setupUi()

  // the ritual reacts to real world state and drives its own visuals
  registerRitualHooks({
    onStart: () => {},
    onPhase: (phase, intensity) => ritualPhaseVisual(phase, intensity),
    onComplete: () => cleanupRitualVisuals()
  })

  // event-driven systems only: pulse, mote orbit, stone pulse, ritual
  engine.addSystem(pulseSystem)
  engine.addSystem(moteOrbitSystem)
  engine.addSystem(stonePulseSystem)
  engine.addSystem(ritualVisualSystem)
  engine.addSystem((dt) => tickRitual(dt))
  engine.addSystem((dt) => tickOnboarding(dt))

  // the environment renders immediately; world state syncs in the background
  void loadWorldState()
  void loadStones().then(() => refreshStoneLabels())

  // first-visit onboarding: three short lines, once per session
  startOnboardingIfFirstVisit()
}

// re-exported so the UI can read the same instances
export { currentOnboardingLine, onboardingState, ritualState }
