// stub for the explorer runtime bridge so the SDK can run in node
export async function getExplorerInformation(): Promise<{ platform: string; explorerVersion: string; isMobile: boolean }> {
  return { platform: 'web', explorerVersion: 'node-test', isMobile: false }
}
