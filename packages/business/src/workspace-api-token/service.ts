import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  TokenHash,
  WorkspaceApiTokenPermission,
  WorkspaceApiTokenScope,
} from "@chatbotx.io/database/partials"
import { workspaceApiTokenRepository } from "@chatbotx.io/database/repositories"
import type {
  WorkspaceApiTokenModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { workspaceService } from "../workspace/service"
import { generateWorkspaceToken } from "./credentials"

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
    // NULL/undefined = unrestricted ("All scopes"); see schema doc.
    scopes?: WorkspaceApiTokenScope[] | null
    tx?: DatabaseClient
  }): Promise<WorkspaceApiTokenModel> {
    const {
      workspaceId,
      name,
      permission,
      tokenHash,
      tokenPrefix,
      scopes,
      tx,
    } = props

    // A bare transaction does not serialize count-then-insert under READ
    // COMMITTED — two concurrent creates can both read count=9 and both
    // commit, breaching the cap. The per-workspace advisory lock, taken
    // before the count, is what actually closes the race: the second
    // transaction blocks until the first commits or rolls back, so it always
    // counts the first's insert. When the caller already owns a tx, reuse it
    // instead of nesting.
    const runInTx = tx
      ? (fn: (txClient: DatabaseClient) => Promise<WorkspaceApiTokenModel>) =>
          fn(tx)
      : (fn: (txClient: DatabaseClient) => Promise<WorkspaceApiTokenModel>) =>
          db.transaction(fn)

    const token = await runInTx(async (txClient) => {
      await workspaceApiTokenRepository.lockWorkspaceTokens(
        workspaceId,
        txClient,
      )

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
        { workspaceId, tokenHash, name, permission, tokenPrefix, scopes },
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
        const scopeSummary =
          scopes && scopes.length > 0 ? scopes.join(",") : "all"
        await this.audit(
          "create",
          `created workspace API token "${name}" (${permission}, scopes: ${scopeSummary})`,
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

  /**
   * Resolves the plaintext of a workspace's default API token, minting one
   * lazily on first use. Backs the `{{api_key}}` system field — the only
   * caller allowed to recover a workspace API token's plaintext after
   * creation, mirroring Stripe's "only the default key is ever shown again"
   * model. Bypasses `MAX_WORKSPACE_API_TOKENS`: this is a system-managed
   * token, so a workspace already at the user-token cap must not lose
   * `{{api_key}}`.
   */
  async resolveDefaultTokenPlaintext(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<string | null> {
    const { workspaceId, tx = db } = props

    const existing = await workspaceApiTokenRepository.findDefaultByWorkspaceId(
      workspaceId,
      tx,
    )
    if (existing) {
      return await this.decryptOrUpgradeDefaultToken(existing, tx)
    }

    const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()
    const encryptedToken = await encryptUtils.encryptText(
      token,
      defaultTokenAad(workspaceId),
    )
    const inserted = await workspaceApiTokenRepository.insertDefault(
      {
        workspaceId,
        tokenHash,
        name: "Default token",
        tokenPrefix,
        encryptedToken,
      },
      tx,
    )
    if (inserted) {
      return token
    }

    // Lost the race to mint the default row — another caller's insert won.
    // Re-select and resolve from it instead of erroring.
    const winner = await workspaceApiTokenRepository.findDefaultByWorkspaceId(
      workspaceId,
      tx,
    )
    if (!winner) {
      logger.warn(
        { workspaceId },
        "Default workspace API token insert conflicted but no row found on re-select",
      )
      return null
    }
    return await this.decryptOrUpgradeDefaultToken(winner, tx)
  }

  private async decryptOrUpgradeDefaultToken(
    row: WorkspaceApiTokenModel,
    tx: DatabaseClient,
  ): Promise<string | null> {
    if (row.encryptedToken) {
      return await encryptUtils.decryptText(
        row.encryptedToken,
        defaultTokenAad(row.workspaceId),
      )
    }

    // Legacy default row backfilled from Workspace.token before
    // `encryptedToken` existed — recover the plaintext from the deprecated
    // column, then lazily upgrade this row so future resolves skip this
    // path. Workspace.token itself is never modified.
    const workspace = await workspaceService.findById({
      id: row.workspaceId,
      tx,
    })
    if (!workspace.token) {
      logger.warn(
        { workspaceId: row.workspaceId, tokenId: row.id },
        "Default workspace API token has no encryptedToken and Workspace.token is empty",
      )
      return null
    }

    const encryptedToken = await encryptUtils.encryptText(
      workspace.token,
      defaultTokenAad(row.workspaceId),
    )
    await workspaceApiTokenRepository.setEncryptedToken(
      { id: row.id, workspaceId: row.workspaceId, encryptedToken },
      tx,
    )

    return workspace.token
  }
}

// Binds an encrypted default-token blob to its workspace so it can never be
// decrypted under the wrong workspace, even if a row were ever copied.
const defaultTokenAad = (workspaceId: string) =>
  `workspace-api-token:${workspaceId}`

export const workspaceApiTokenService = new WorkspaceApiTokenService()
