// The World Remembers — persistent Memory Tree (Phase C) + Memory Stones
// (Phase D). Enter, see the tree, tap, the server saves, the tree responds.
// The stones remember who was here before you.
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
  createHeartLight()
  createMemoryTree()
  if (validateStoneConfig()) {
    setupStones()
  }
  setupUi()

  // three tiny systems: contribution pulse, mote orbit, stone pulse/orbit
  engine.addSystem(pulseSystem)
  engine.addSystem(moteOrbitSystem)
  engine.addSystem(stonePulseSystem)

  // the environment renders immediately; world state syncs in the background
  void loadWorldState()
  void loadStones().then(() => refreshStoneLabels())
}
