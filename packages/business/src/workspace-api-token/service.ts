import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { workspaceApiTokenRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { workspaceService } from "../workspace/service"

class WorkspaceApiTokenService extends BaseService {
  // Deliberately uncached, like the channel-API bearer lookup
  // (integrationApiRepository.findByTokenHash): caching an auth-token lookup
  // lets a rotated-out token keep authenticating until the entry expires or a
  // racing read repopulates it past the invalidation. The hash column is
  // unique-indexed, so this is one cheap point lookup per request — and the
  // workspace row behind it is still served from workspaceService's own
  // cache.
  async findWorkspaceByTokenHash(props: {
    tokenHash: string
    tx?: DatabaseClient
  }) {
    const { tokenHash, tx = db } = props

    const row = await workspaceApiTokenRepository.findByTokenHash(tokenHash, tx)
    if (!row) {
      return
    }
    return await workspaceService.findById({ id: row.workspaceId, tx })
  }

  /** Whether the workspace has an API token. The digest never leaves here. */
  async hasToken(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, tx = db } = props

    return await workspaceApiTokenRepository.existsByWorkspaceId(
      workspaceId,
      tx,
    )
  }

  // Replace-write: single-token invariant until Track D adds scoped, named
  // tokens. Delete + insert inside one transaction so the row count never
  // exceeds one per workspace even under a retried caller.
  async replaceToken(props: {
    workspaceId: string
    tokenHash: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, tokenHash, tx = db } = props

    await tx.transaction(async (innerTx) => {
      await workspaceApiTokenRepository.deleteByWorkspaceId(
        workspaceId,
        innerTx,
      )
      await workspaceApiTokenRepository.insert(
        { workspaceId, tokenHash },
        innerTx,
      )
    })

    // Only when the transaction is service-owned — emitting inside a
    // caller-owned tx would enqueue an audit row for a write that might still
    // roll back (same rule as workspaceService.update). Never the raw token.
    if (!props.tx) {
      await this.audit("update", "created/regenerated workspace API key")
    }
  }
}

export const workspaceApiTokenService = new WorkspaceApiTokenService()
