// The World Remembers — persistent Memory Tree + Memory Stones (Phases A-D)
// plus Phase E: world composition, onboarding and the World Heartbeat ritual.
// Enter, see the tree, tap, the server saves, the world remembers.
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { setupGarden } from './garden'
import { API, STAGES } from './config'
import { getPlayerIdentity } from './identity'
import { HttpExpeditionProvider, HttpMissionProvider, HttpStoneProvider, HttpWorldStateProvider } from './http-provider'
import { loadWorldState, playerContributedFlag, setStateListener, worldState } from './state'
import { loadStones, playerStoneMemoryIds, setStoneIdentityResolver, stoneState } from './stone-state'
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
import {
  applyMission,
  loadMission,
  missionActive,
  missionCompleted,
  missionState,
  setContributedFlag,
  setMissionIdentityResolver,
  setStoneMemoriesOf
} from './mission'
import {
  addExpeditionTarget,
  buildTargets,
  clearInteraction,
  clearExpeditionTargets,
  interactionState,
  updateInteraction,
  EXPEDITION_INTERACTION_RADIUS
} from './interaction'
import { bloomSystem, syncMissionCompletion } from './mission-complete'
import {
  createExpeditionSite,
  expeditionVisualSystem,
  setFragmentIdentityResolver,
  syncExpeditionSites
} from './fragments'
import {
  expeditionFragments,
  expeditionIsCollected,
  expeditionState,
  loadExpedition,
  setExpeditionIdentityResolver
} from './expedition'
import { resetRestoration, restorationSystem, restorationWaveSystem } from './restoration'
import type { MissionState } from '../shared/mission'
import { FRAGMENT_LOCATIONS } from '../shared/expedition'

export function main() {
  // fixed skybox so every visitor sees the stage mood consistently
  SkyboxTime.create(engine.RootEntity, { fixedTime: STAGES.skyTimes[0] })

  // the server is the source of truth for world state, stone memories and
  // the mission. Embedded mission payloads ride on the existing contribute
  // and stone-memory responses, so progress updates need no extra calls.
  const applyMissionPayload = (mission: MissionState) => {
    applyMission(mission)
    syncMissionCompletion()
  }
  worldState.provider = new HttpWorldStateProvider(API.baseUrl, fetch, (m) => {
    if (m) applyMissionPayload(m)
  })
  stoneState.provider = new HttpStoneProvider(API.baseUrl, fetch, (m) => {
    if (m) applyMissionPayload(m)
  })
  missionState.provider = new HttpMissionProvider(API.baseUrl)
  expeditionState.provider = new HttpExpeditionProvider(API.baseUrl, getPlayerIdentity)
  // stones and mission use the same DCL session identity as contributions
  setStoneIdentityResolver()
  setMissionIdentityResolver()
  setExpeditionIdentityResolver()
  setFragmentIdentityResolver(getPlayerIdentity)

  // wire session-local participation evidence into the mission panel
  setContributedFlag(playerContributedFlag)
  setStoneMemoriesOf(playerStoneMemoryIds)

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

  // event-driven systems only: pulse, mote orbit, stone pulse, ritual,
  // mission bloom, expedition visuals, restoration, and the low-frequency
  // proximity check (0.5s tick)
  engine.addSystem(pulseSystem)
  engine.addSystem(moteOrbitSystem)
  engine.addSystem(stonePulseSystem)
  engine.addSystem(ritualVisualSystem)
  engine.addSystem(bloomSystem)
  engine.addSystem(expeditionVisualSystem)
  engine.addSystem(restorationSystem)
  engine.addSystem(restorationWaveSystem)
  engine.addSystem((dt) => tickRitual(dt))
  engine.addSystem((dt) => tickOnboarding(dt))
  engine.addSystem(proximitySystem)

  // the environment renders immediately; world state syncs in the background
  void loadWorldState()
  void loadStones().then(() => refreshStoneLabels())
  void loadMission().then(() => {
    syncMissionCompletion()
    refreshInteraction()
  })
  // expedition: spawn today's sites, then sync them against server state
  void loadExpedition().then(() => {
    setupExpeditionSites()
    refreshInteraction()
  })

  // first-visit onboarding: three short lines, once per session
  startOnboardingIfFirstVisit()
}

// --- contextual interaction -------------------------------------------------

// The interaction target list is rebuilt when mission state changes, so the
// tree gets mission priority while the mission is active and uncompleted.
let interactionTargets = buildTargets({ missionActive: true, missionCompleted: false })

// Spawn today's expedition sites (guardians + hidden fragments) and add
// them to the interaction manager. Called once the expedition loads.
function setupExpeditionSites(): void {
  clearExpeditionTargets()
  for (const f of expeditionFragments()) {
    const rig = createExpeditionSite(f.id)
    const collected = expeditionIsCollected(f.id)
    if (collected) {
      // already collected today: dissolve immediately (server says so)
      if (rig.guardian) engine.removeEntity(rig.guardian)
      rig.guardian = null
      if (rig.fragment) engine.removeEntity(rig.fragment)
      rig.fragment = null
      rig.collected = true
    } else {
      // the guardian is the current objective; the fragment becomes the
      // target once the guardian is cleared
      const loc = FRAGMENT_LOCATIONS[f.id]
      addExpeditionTarget({
        id: `guardian-${f.id}`,
        type: 'guardian',
        position: { x: loc.x, z: loc.z },
        radius: EXPEDITION_INTERACTION_RADIUS,
        label: 'DISPEL',
        hint: `${expeditionHitsLabel(f.id)} — 3 hits to clear`,
        priority: 1,
        enabled: true
      })
    }
  }
  syncExpeditionSites()
  refreshInteraction()
}

// short hit label: "2 / 3 MEMORY ENERGY"
function expeditionHitsLabel(id: string): string {
  const hits = expeditionFragments().find((f) => f.id === id)?.hits ?? 0
  return `${hits} / 3`
}

function refreshInteraction(): void {
  interactionTargets = buildTargets({
    missionActive: missionActive(),
    missionCompleted: missionCompleted()
  })
  const p = getPlayer()
  if (p?.position) {
    updateInteraction({ x: p.position.x, z: p.position.z }, interactionTargets)
  } else {
    clearInteraction()
  }
}

// Low-frequency proximity check: 0.5s tick, never per-frame.
let proximityAccum = 0
function proximitySystem(dt: number): void {
  proximityAccum += dt
  if (proximityAccum < 0.5) return
  proximityAccum = 0
  refreshInteraction()
}

// re-exported so the UI can read the same instances
export { currentOnboardingLine, interactionState, onboardingState, ritualState }
