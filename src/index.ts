// The World Remembers — persistent Memory Tree + Memory Stones (Phases A-D)
// plus Phase E: world composition, onboarding and the World Heartbeat ritual.
// Enter, see the tree, tap, the server saves, the world remembers.
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { setupGarden } from './garden'
import { API, STAGES } from './config'
import { getPlayerIdentity } from './identity'
import {
  HttpExpeditionProvider,
  HttpLivingWorldProvider,
  HttpMissionProvider,
  HttpStoneProvider,
  HttpWorldStateProvider
} from './http-provider'
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
  syncExpeditionSites,
  updateBeacons
} from './fragments'
import {
  expeditionFragments,
  expeditionIsCollected,
  expeditionState,
  loadExpedition,
  setExpeditionIdentityResolver
} from './expedition'
import { resetRestoration, restorationSystem, restorationWaveSystem, startRestoration } from './restoration'
import { startPulse } from './tree'
import { setupLighthouse } from './lighthouse'
import {
  applyLivingWorld,
  livingDailyPulse,
  livingRareDiscovered,
  livingRareLocation,
  livingWorldState,
  loadLivingWorld,
  setLivingIdentityResolver
} from './living-world'
import { syncLivingWorld } from './world-evolution'
import type { MissionState } from '../shared/mission'
import { fragmentLocation } from '../shared/expedition'
import { missionTrailSystem, syncMissionTrail } from './mission-trail'
import { describeNextTarget, tickNavDirection } from './navigation'
import { buildRealmEnvironment } from './realm-environment'
import { enterRealm } from './realm-portal'
import { realmById, type RealmDefinition } from '../shared/realms'
import { expeditionCompleted } from './expedition'

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
  livingWorldState.provider = new HttpLivingWorldProvider(API.baseUrl, getPlayerIdentity)
  // stones and mission use the same DCL session identity as contributions
  setStoneIdentityResolver()
  setMissionIdentityResolver()
  setExpeditionIdentityResolver()
  setLivingIdentityResolver()
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
  setupLighthouse()
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
  engine.addSystem((dt) => dailyPulseSystem(dt))
  engine.addSystem((dt) => tickRitual(dt))
  engine.addSystem((dt) => tickOnboarding(dt))
  engine.addSystem(proximitySystem)
  engine.addSystem(missionTrailSystem)

  // the environment renders immediately; world state syncs in the background
  void loadWorldState()
  void loadStones().then(() => refreshStoneLabels())
  void loadMission().then(() => {
    syncMissionCompletion()
    refreshInteraction()
  })
  // expedition: spawn today's sites in the realm, build the realm, wire nav
  void loadExpedition().then(() => {
    const realm = currentExpRealm()
    if (realm) buildRealmEnvironment(realm)
    setupExpeditionSites()
    syncMissionTrail()
    refreshInteraction()
  })
  // living world: memory level, landmark, rare memory, daily pulse
  void loadLivingWorld().then(() => {
    syncLivingWorld()
    // the daily Memory Pulse plays for everyone once the world has life
    if (livingDailyPulse()) {
      pulseRequested = true
    }
    refreshInteraction()
  })

  // first-visit onboarding: three short lines, once per session
  startOnboardingIfFirstVisit()
}

// --- contextual interaction -------------------------------------------------

// The interaction target list is rebuilt when mission state changes, so the
// tree gets mission priority while the mission is active and uncompleted.
let interactionTargets = buildTargets({ missionActive: true, missionCompleted: false })

// Spawn today's expedition sites (guardians + hidden fragments). The
// interaction TARGETS themselves are rebuilt every proximity tick by
// rebuildExpeditionTargets so a defeated guardian swaps to a COLLECT target
// and a collected one disappears — no stale DISPEL / no ghost CTA.
function setupExpeditionSites(): void {
  clearExpeditionTargets()
  for (const f of expeditionFragments()) {
    const rig = createExpeditionSite(f.id)
    if (expeditionIsCollected(f.id)) {
      // already collected today: dissolve immediately (server says so)
      if (rig.guardian) engine.removeEntity(rig.guardian)
      rig.guardian = null
      if (rig.fragment) engine.removeEntity(rig.fragment)
      rig.fragment = null
      rig.collected = true
    }
  }
  syncExpeditionSites()
  refreshInteraction()
}

// Rebuild the expedition interaction targets from the CURRENT authoritative
// state. Uncollected + guarded -> DISPEL; uncollected + cleared -> COLLECT;
// collected -> nothing. Called every 0.5s proximity tick, so the CTA always
// matches the real objective (one canonical target per objective).
function rebuildExpeditionTargets(): void {
  clearExpeditionTargets()
  const realm = currentExpRealm()
  if (!realm) return
  for (const f of expeditionFragments()) {
    if (f.collected) continue
    const loc = fragmentLocation(f.id) ?? { x: 0, z: 0 }
    if (f.hits < 3) {
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
    } else {
      addExpeditionTarget({
        id: `fragment-${f.id}`,
        type: 'fragment',
        position: { x: loc.x, z: loc.z },
        radius: EXPEDITION_INTERACTION_RADIUS,
        label: 'COLLECT MEMORY',
        hint: 'A memory waits',
        priority: 1,
        enabled: true
      })
    }
  }
  // the Hub->Realm gate: walks up to it (or taps ENTER on the card) to enter
  if (!expeditionCompleted()) {
    addExpeditionTarget({
      id: 'portal-hub',
      type: 'portal',
      position: HUB_GATE,
      radius: 6,
      label: `ENTER ${realm.name.toUpperCase()}`,
      hint: "Step into today's Memory Realm",
      priority: 2,
      enabled: true
    })
  }
}

// Today's realm (from the server's expedition state), or undefined.
function currentExpRealm(): RealmDefinition | undefined {
  const id = expeditionState.state?.realm.id
  return id ? realmById(id) : undefined
}

// The visible Hub->Realm gate position (scene-local, east of the plaza).
export const HUB_GATE = { x: 34, z: 16 }

// short hit label with dispel progress dots: "● ● ○ — 1/3 hits"
function expeditionHitsLabel(id: string): string {
  const hits = expeditionFragments().find((f) => f.id === id)?.hits ?? 0
  const dots = '●'.repeat(hits) + '○'.repeat(Math.max(0, 3 - hits))
  return `${dots}  ${hits} / 3 hits`
}

function refreshInteraction(): void {
  // rebuild expedition targets first so the CTA matches the authoritative
  // state each tick (fixes stale DISPEL after defeat + enables UI COLLECT)
  rebuildExpeditionTargets()
  interactionTargets = buildTargets({
    missionActive: missionActive(),
    missionCompleted: missionCompleted()
  })
  // G5: the undiscovered Rare Memory is the top expedition-adjacent target
  const rareLoc = livingRareLocation()
  if (rareLoc !== null && !livingRareDiscovered()) {
    const pos = fragmentLocation(rareLoc)
    if (pos) {
      addExpeditionTarget({
        id: `rare-${rareLoc}`,
        type: 'fragment',
        position: { x: pos.x, z: pos.z },
        radius: EXPEDITION_INTERACTION_RADIUS,
        label: 'DISCOVER RARE MEMORY',
        hint: 'A golden memory waits',
        priority: 1,
        enabled: true
      })
    }
  }
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
  const p = getPlayer()
  if (p?.position) {
    // feed the simple direction + tune the beacons at the same low rate
    const nav = describeNextTarget({ x: p.position.x, z: p.position.z })
    if (nav.hasTarget) tickNavDirection(nav.distance)
    updateBeacons({ x: p.position.x, z: p.position.z })
  } else {
    updateBeacons(null)
  }
}

// --- daily Memory Pulse (F3) ------------------------------------------------

// The pulse plays once when the player loads into a world that has life
// today (server says dailyEvent.pulse). One short visual event, everyone
// sees the same thing: wave ring + tree pulse + sky shift.
let pulseRequested = false
let pulsePlayed = false

function dailyPulseSystem(dt: number): void {
  if (!pulseRequested || pulsePlayed) return
  pulsePlayed = true
  // reuse the restoration: tree pulse + expanding light wave + sky shift
  startRestoration([])
}

// re-exported so the UI can read the same instances
export { currentOnboardingLine, interactionState, onboardingState, ritualState }
