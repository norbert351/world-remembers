// Local world state for Phase A. The provider interface lets Phase C swap in
// the HTTPS API without touching scene code.
import { stageIndexFor } from '../shared/world-state'

export interface WorldStateProvider {
  load(): Promise<number>
  save(count: number): Promise<void>
}

// Mock provider: in-memory only. Contributions live for the session.
class LocalProvider implements WorldStateProvider {
  private count = 0
  async load(): Promise<number> {
    return this.count
  }
  async save(count: number): Promise<void> {
    this.count = count
  }
}

export const worldState = {
  contributions: 0,
  provider: new LocalProvider() as WorldStateProvider,
  // bumped on every change so the UI re-renders fresh values
  version: 0,
  // epoch ms of the last contribution, drives the toast timer
  lastContributionAt: 0
}

// Scene-side stage helper: contribution count -> stage index.
// The canonical stage logic lives in shared/world-state.ts.
export const stageFor = stageIndexFor

export async function loadWorldState(): Promise<void> {
  const saved = await worldState.provider.load()
  worldState.contributions = saved
  worldState.version++
}

export function addContribution(): void {
  worldState.contributions++
  worldState.lastContributionAt = Date.now()
  worldState.version++
  // fire and forget; Phase C swaps in a real provider
  void worldState.provider.save(worldState.contributions)
}
