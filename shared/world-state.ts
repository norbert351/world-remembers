// Single source of truth for Memory Tree progression.
// Used by the scene (src/config.ts) and the backend (backend/src/stages.ts).
// Do not redefine these thresholds anywhere else.

export const STAGE_THRESHOLDS = [0, 100, 250, 500]

export const STAGE_NAMES = ['DORMANT', 'AWAKENED', 'GROWING', 'FLOURISHING'] as const

export type TreeStage = (typeof STAGE_NAMES)[number]

// Returns the stage index (0..3) for a contribution count.
export function stageIndexFor(count: number): number {
  let stage = 0
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
    if (count >= STAGE_THRESHOLDS[i]) stage = i
  }
  return stage
}

// Returns the stage name for a contribution count.
export function stageFor(count: number): TreeStage {
  return STAGE_NAMES[stageIndexFor(count)]
}
