import { createHash } from "node:crypto"
import { workspaceService } from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"

const DEDUPE_TTL_SECONDS = 600
const LOCK_TIMEOUT_SECONDS = 30

/**
 * Every OAuth channel callback (Messenger/Instagram/TikTok/Zalo/…) shares one
 * "create a workspace when the state carries no workspaceId" branch. A slow
 * provider round-trip plus an impatient re-submit hits that branch twice with
 * the SAME `state` (it's fixed at authorize time) for the SAME user, and
 * without this guard each hit would create its own "New Workspace" and
 * consume a "workspaces" quota unit — only the first hit ever gets a channel
 * attached, leaving the rest as empty, quota-consuming orphans. Locking +
 * caching the result by `state` + `userId` makes a repeat hit from the same
 * user reuse the workspace the first hit already created instead of spinning
 * up another one.
 *
 * `userId` is folded into the key (not just `state`) because `state` alone is
 * identical for every user starting the same "connect a new workspace" flow
 * — it carries no nonce or user identity. Keying on `state` alone would let
 * two unrelated users racing this branch within the TTL window collide onto
 * the same cached workspace.
 *
 * The lock and the cached value use DIFFERENT Redis keys: the lock's own
 * internal SET/DEL bookkeeping would otherwise land on the exact key the
 * cached value is stored under, and overwriting that value from inside the
 * critical section breaks the lock's own release (a compare-and-delete that
 * no longer matches), leaving the key stuck until its TTL and turning the
 * next duplicate hit into a ~30s hang followed by a thrown lock error.
 */
export async function createWorkspaceForNewOauthState(args: {
  state: string
  userId: string
}): Promise<WorkspaceModel> {
  const hash = createHash("sha256")
    .update(`${args.state}:${args.userId}`)
    .digest("hex")
  const lockKey = `oauth-create-workspace-lock:${hash}`
  const cacheKey = `oauth-create-workspace:${hash}`

  return await distributedLock.runExclusive({
    key: lockKey,
    timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const existingWorkspaceId = await distributedStore.get<string>(cacheKey)
      if (existingWorkspaceId) {
        const cached = await findCachedWorkspace(existingWorkspaceId)
        if (cached) {
          return cached
        }
      }

      const created = await workspaceService.create({
        data: { name: "New Workspace", ownerId: args.userId },
        createdBy: args.userId,
      })
      // TTL only needs to outlive the re-submits of a single OAuth attempt.
      await distributedStore.put(cacheKey, created.id, DEDUPE_TTL_SECONDS)
      return created
    },
  })
}

// The cached id can outlive the workspace it points to (deleted in the
// interim); fall back to creating a fresh one instead of throwing, unlike
// every other outcome of `workspaceService.findById`.
async function findCachedWorkspace(id: string): Promise<WorkspaceModel | null> {
  try {
    return await workspaceService.findById({ id })
  } catch {
    return null
  }
}
