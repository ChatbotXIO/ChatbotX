import { workspaceSipNodeRepository } from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"

const LOCK_TIMEOUT_SECONDS = 10
const NODE_ALLOC_LOCK_KEY = "freeswitch-node-alloc"

/**
 * Pure least-loaded chooser: the node with the fewest pinned workspaces,
 * falling back to the FIRST node id (stable order) on a full tie so the
 * choice is deterministic and testable. `nodeIds` is passed explicitly
 * (rather than read from `counts`) so a node with zero pins — and therefore
 * absent from `counts` — is still eligible.
 */
export const chooseLeastLoadedNode = (
  nodeIds: readonly string[],
  countsByNode: Record<string, number>,
): string => {
  if (nodeIds.length === 0) {
    throw new Error("chooseLeastLoadedNode: no FreeSWITCH nodes configured")
  }
  return nodeIds.reduce((best, candidate) => {
    const bestCount = countsByNode[best] ?? 0
    const candidateCount = countsByNode[candidate] ?? 0
    return candidateCount < bestCount ? candidate : best
  })
}

/**
 * Atomically pins a workspace to exactly one FreeSWITCH node:
 * `workspaceSipNodeRepository.pinOrGet` runs inside
 * `distributedLock.runExclusive` so the count-then-insert is atomic ACROSS
 * workspaces (two workspaces pinning concurrently never both read the same
 * stale counts and pile onto the same node); the repository's own
 * `ON CONFLICT (workspaceId) DO NOTHING` covers a lost-lock race for the
 * SAME workspace.
 */
export const pinWorkspaceToNode = async (input: {
  workspaceId: string
  nodeIds: readonly string[]
}): Promise<{ nodeId: string }> => {
  const pinned = await distributedLock.runExclusive({
    key: NODE_ALLOC_LOCK_KEY,
    timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
    fn: () =>
      workspaceSipNodeRepository.pinOrGet({
        workspaceId: input.workspaceId,
        chooseNode: (countsByNode) =>
          chooseLeastLoadedNode(input.nodeIds, countsByNode),
      }),
  })
  return { nodeId: pinned.nodeId }
}
