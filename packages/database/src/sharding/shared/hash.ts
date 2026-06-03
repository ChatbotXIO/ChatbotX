export function workspaceShardIndex(
  workspaceId: string,
  numShards: number,
): number {
  const MOD = 1_000_000_007
  let h = 5381
  for (let i = 0; i < workspaceId.length; i++) {
    h = (h * 33 + workspaceId.charCodeAt(i)) % MOD
  }
  return h % numShards
}
