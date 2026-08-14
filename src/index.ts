// The World Remembers — persistent Memory Tree (Phase C).
// Enter, see the tree, tap, the server saves, the tree responds.
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { setupGarden } from './garden'
import { API, STAGES } from './config'
import { HttpWorldStateProvider } from './http-provider'
import { loadWorldState, setStateListener, worldState } from './state'
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

  // the server is the source of truth for world state
  worldState.provider = new HttpWorldStateProvider(API.baseUrl)

  // every server-confirmed state change flows through applyWorldState and
  // lands here, so tree and world always move together
  setStateListener(() => applyCurrentStage())

  setupGarden()
  createHeartLight()
  createMemoryTree()
  setupUi()

  // only two systems: contribution pulse + slow mote orbit
  engine.addSystem(pulseSystem)
  engine.addSystem(moteOrbitSystem)

  // the environment renders immediately; world state syncs in the background
  void loadWorldState()
}
