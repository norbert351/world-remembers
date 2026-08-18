// Memory Realm portals. Uses the documented in-scene teleport, movePlayerTo
// (from ~system/RestrictedActions), to carry the player between the Memory
// Hub and today's realm, and back. This is the ONLY mechanism that keeps the
// "I'm somewhere else now" moment seamless inside a single deployable World
// (cross-scene teleportTo would show a confirmation screen).
//
// Also switches the skybox to the realm's mood on entry and back on return,
// so entering a realm immediately reads as "a different place".
import { engine, SkyboxTime } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import type { RealmDefinition } from '../shared/realms'
import { realmWorld } from '../shared/realms'
import { STAGES, TREE } from './config'
import { stageFor, worldState } from './state'

// Scene-local world position the player lands on when entering the Hub (near
// the Memory Tree, facing the plaza).
export function hubTravelTarget(): { x: number; z: number } {
  return { x: TREE.position.x + 2, z: TREE.position.z + 2 }
}

// Move the player into today's realm (at its entry portal) and switch the sky.
export async function enterRealm(realm: RealmDefinition): Promise<void> {
  const landing = realmWorld(realm, realm.portalIn.local)
  // swap sky to the realm's mood first so the landing already feels different
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: realm.sky.fixedTime })
  try {
    await movePlayerTo({
      newRelativePosition: Vector3.create(landing.x, 0.5, landing.z),
      cameraTarget: Vector3.create(landing.x + 1, 2, landing.z - 1)
    })
  } catch {
    // input may have interrupted the transition; the player is still in the
    // scene and can walk — never fatal
  }
}

// Bring the player home to the Hub and restore the Hub sky (mood of the
// current memory level).
export async function returnToHub(): Promise<void> {
  const stage = stageFor(worldState.contributions)
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: STAGES.skyTimes[Math.min(stage, STAGES.skyTimes.length - 1)] })
  const target = hubTravelTarget()
  try {
    await movePlayerTo({
      newRelativePosition: Vector3.create(target.x, 0.5, target.z),
      cameraTarget: Vector3.create(TREE.position.x, 3, TREE.position.z)
    })
  } catch {
    // non-fatal
  }
}
