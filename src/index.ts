// The World Remembers — Memory Tree vertical slice (Phase A).
// Enter, see the tree, tap, contribute, watch it respond.
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { setupGarden } from './garden'
import { STAGES } from './config'
import { loadWorldState } from './state'
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

  setupGarden()
  createHeartLight()
  createMemoryTree()
  setupUi()

  // only two systems: contribution pulse + slow mote orbit
  engine.addSystem(pulseSystem)
  engine.addSystem(moteOrbitSystem)

  // load the persisted count (mock provider in Phase A) and apply its stage
  void loadWorldState().then(() => {
    applyCurrentStage()
  })
}
