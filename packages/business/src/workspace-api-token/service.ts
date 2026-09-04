import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  TokenHash,
  WorkspaceApiTokenPermission,
} from "@chatbotx.io/database/partials"
import { workspaceApiTokenRepository } from "@chatbotx.io/database/repositories"
import type {
  WorkspaceApiTokenModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { workspaceService } from "../workspace/service"

export const MAX_WORKSPACE_API_TOKENS = 10

// Worst-case window a revoked token can keep authenticating: deleteToken
// invalidates this tag on every successful delete, so revocation is normally
// near-instant. This TTL only bounds the rare invalidation-race or
// Redis-failure case. Negative lookups (invalid token) are never cached —
// withCache skips null/undefined results — so token-guessing floods still
// hit the DB every time; the pre-auth IP rate limiter is the defense there.
const WORKSPACE_API_TOKEN_CACHE_TTL_SECONDS = 300

export const workspaceApiTokenCacheTag = (workspaceId: string) =>
  `workspace-api-tokens:${workspaceId}`

class WorkspaceApiTokenService extends BaseService {
  async findWorkspaceByTokenHash(props: {
    tokenHash: TokenHash
    tx?: DatabaseClient
  }): Promise<
    { workspace: WorkspaceModel; apiToken: WorkspaceApiTokenModel } | undefined
  > {
    const { tokenHash, tx = db } = props

    // Caching is skipped inside a caller-owned transaction: the write may
    // still roll back, and caching it here could serve uncommitted/stale
    // data for the full TTL. The auth middleware never passes `tx`, so this
    // does not affect the hot path's hit rate.
    const apiToken = props.tx
      ? await workspaceApiTokenRepository.findByTokenHash(tokenHash, tx)
      : await withCache(
          `workspace-api-tokens:hash:${tokenHash}`,
          async () =>
            await workspaceApiTokenRepository.findByTokenHash(tokenHash, tx),
          {
            ttl: WORKSPACE_API_TOKEN_CACHE_TTL_SECONDS,
            dynamicTags: (row) =>
              row ? [workspaceApiTokenCacheTag(row.workspaceId)] : undefined,
          },
        )
    if (!apiToken) {
      return
    }
    // FK is ON DELETE CASCADE, so a matching token row always has a live
    // workspace — findById's findOrFail() is safe here, not a leak risk.
    const workspace = await workspaceService.findById({
      id: apiToken.workspaceId,
      tx,
    })
    return { workspace, apiToken }
  }

  async listTokens(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<WorkspaceApiTokenModel[]> {
    const { workspaceId, tx = db } = props

    return await workspaceApiTokenRepository.listByWorkspaceId(workspaceId, tx)
  }

  async createToken(props: {
    workspaceId: string
    name: string
    permission: WorkspaceApiTokenPermission
    tokenHash: TokenHash
    tokenPrefix: string
    tx?: DatabaseClient
  }): Promise<WorkspaceApiTokenModel> {
    const { workspaceId, name, permission, tokenHash, tokenPrefix, tx } = props

    // Count-then-insert must share one transaction: without it, two
    // concurrent creates can both read count=9 and both commit, breaching the
    // cap. When the caller already owns a tx, reuse it instead of nesting.
    const runInTx = tx
      ? (fn: (txClient: DatabaseClient) => Promise<WorkspaceApiTokenModel>) =>
          fn(tx)
      : (fn: (txClient: DatabaseClient) => Promise<WorkspaceApiTokenModel>) =>
          db.transaction(fn)

    const token = await runInTx(async (txClient) => {
      const count = await workspaceApiTokenRepository.countByWorkspaceId(
        workspaceId,
        txClient,
      )
      if (count >= MAX_WORKSPACE_API_TOKENS) {
        throw new ChatbotXException(
          `Workspace has reached the maximum of ${MAX_WORKSPACE_API_TOKENS} API tokens`,
          "workspaceApiTokenLimitReached",
        )
      }

      return await workspaceApiTokenRepository.insert(
        { workspaceId, tokenHash, name, permission, tokenPrefix },
        txClient,
      )
    })

    // Only when the transaction is service-owned — emitting inside a
    // caller-owned tx would enqueue an audit row for a write that might still
    // roll back (same rule as workspaceService.update). Never the raw token
    // or hash. Best-effort: an audit failure must not turn an already
    // committed create into a user-visible error.
    if (!props.tx) {
      try {
        await this.audit(
          "create",
          `created workspace API token "${name}" (${permission})`,
        )
      } catch (err) {
        logger.warn(
          { err, workspaceId, tokenId: token.id },
          "Failed to record audit log for workspace API token creation",
        )
      }
    }

    return token
  }

  async deleteToken(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, id, tx = db } = props

    const deleted = await workspaceApiTokenRepository.deleteByIdForWorkspace(
      { id, workspaceId },
      tx,
    )

    if (deleted) {
      // Best-effort: a Redis failure here must not fail the delete that
      // already committed to the DB. The TTL above bounds any resulting
      // staleness even if this invalidation is dropped.
      try {
        await this.invalidateCacheTags(workspaceApiTokenCacheTag(workspaceId))
      } catch (err) {
        logger.warn(
          { err, workspaceId, id },
          "Failed to invalidate workspace API token cache; delete still applied",
        )
      }
    }

    if (deleted && !props.tx) {
      // Best-effort, same rationale as the cache invalidation above: an audit
      // failure must not turn an already committed delete into a
      // user-visible error.
      try {
        await this.audit("delete", `deleted workspace API token "${id}"`)
      } catch (err) {
        logger.warn(
          { err, workspaceId, id },
          "Failed to record audit log for workspace API token deletion",
        )
      }
    }

    return deleted
  }
}

export const workspaceApiTokenService = new WorkspaceApiTokenService()
