// Node test stub for ~system/RestrictedActions. The scene build (sdk-commands)
// resolves the real module; the node-based scene smoke test bundles the scene
// and must satisfy this import with a no-op so it can typecheck/run without an
// engine. Teleports are never exercised in the node smoke.
export async function movePlayerTo(_opts: { newRelativePosition?: unknown; cameraTarget?: unknown }): Promise<void> {}
