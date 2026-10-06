import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  integrationZaloModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import type { AuthValue } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  recordRefreshedAuth,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import { channelDuplicatedException, notFoundException } from "../errors"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { tagSyncService } from "../tag/sync.service"

class ZaloIntegrationService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationZaloModel.findFirst({ where: { workspaceId } })
  }

  async updateTagSync(props: {
    workspaceId: string
    integrationId: string
    enabled: boolean
  }): Promise<Date | null> {
    const updated = await db
      .update(integrationZaloModel)
      .set({ syncTagEnabledAt: props.enabled ? new Date() : null })
      .where(
        and(
          eq(integrationZaloModel.id, props.integrationId),
          eq(integrationZaloModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ syncTagEnabledAt: integrationZaloModel.syncTagEnabledAt })

    if (updated.length === 0) {
      throw notFoundException("Zalo channel not found")
    }

    await this.invalidateCacheTags(`workspaces:${props.workspaceId}#zalos`)

    return updated[0].syncTagEnabledAt
  }
  async findAll(): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
  }

  async findAllByWorkspaceIds(
    workspaceIds: string[],
  ): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    if (workspaceIds.length === 0) {
      return []
    }
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
      .where(inArray(integrationZaloModel.workspaceId, workspaceIds))
  }

  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration Zalo not found",
    })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  async updateAuth(
    id: string,
    auth: Record<string, unknown>,
    name?: string,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    const [row] = await client
      .update(integrationZaloModel)
      .set({ auth, tokenRefreshError: null, ...(name ? { name } : {}) })
      .where(eq(integrationZaloModel.id, id))
      .returning({
        oaId: integrationZaloModel.oaId,
        workspaceId: integrationZaloModel.workspaceId,
      })
    if (!row) {
      throw notFoundException("Zalo integration not found")
    }
    await recordRefreshedAuth({
      workspaceId: row.workspaceId,
      provider: "zalo",
      sourceId: row.oaId,
      auth: auth as AuthValue,
      tx,
    })
  }

  async markTokenRefreshError(props: {
    id: string
    workspaceId: string
    error: string
    isRevoked: boolean
  }): Promise<void> {
    const [row] = await db
      .update(integrationZaloModel)
      .set({ tokenRefreshError: props.error })
      .where(
        and(
          eq(integrationZaloModel.id, props.id),
          eq(integrationZaloModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ oaId: integrationZaloModel.oaId })

    if (!row) {
      logger.warn(
        { integrationId: props.id, workspaceId: props.workspaceId },
        "Unable to mark Zalo token refresh error: integration not found",
      )
      return
    }

    if (props.isRevoked) {
      await connectionStateService.markUnhealthyByIdentifier({
        provider: "zalo",
        identifier: row.oaId,
        workspaceId: props.workspaceId,
        reason: "token_revoked",
      })
      return
    }

    await connectionStateService.markDegradedByIdentifier({
      provider: "zalo",
      identifier: row.oaId,
      workspaceId: props.workspaceId,
      reason: "refresh_failed",
    })
  }

  /**
   * Load a Zalo integration by OA id with NO workspace scope — used by
   * inbound webhooks (e.g. inbox-label sync) that only have the OA id and
   * have not yet resolved a workspace.
   */
  findByOaId(props: { oaId: string }) {
    return db.query.integrationZaloModel.findFirst({
      where: { oaId: props.oaId },
    })
  }

  async listByWorkspace(
    where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>,
  ): Promise<IntegrationZaloModel[]> {
    return await db.query.integrationZaloModel.findMany({
      where,
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    oaId: string
    name: string
    auth: AuthValue
  }): Promise<{ integrationId: string | undefined; wasCreated: boolean }> {
    const { workspaceId, ownerId, oaId, name, auth } = input

    // A different workspace already holding a *connected* Inbox for this OA
    // blocks the connect outright. Zalo's store binding deliberately carries
    // no `duplicateConstraint` (cross-workspace duplicates get reported for
    // manual review instead of enforced by a DB unique index), so this
    // `isConnected` check is the only thing standing in for one.
    if (
      await inboxService.isConnected({
        channel: "zalo",
        sourceId: oaId,
        workspaceId,
      })
    ) {
      throw channelDuplicatedException()
    }

    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }

    const { integrationId, wasCreated } = await withQuotaCompensation(
      {
        ownerId,
        quotaConsumption,
        context: { provider: "zalo", workspaceId, oaId },
      },
      () =>
        db.transaction(async (tx) => {
          // A found row means this OA was already connected (possibly since
          // disconnected) in THIS workspace — `upsertConnectionRow` revives it
          // in place via `saveAuthByForeignKey` instead of inserting a second
          // row.
          const existing = await connectionRepository.findByProviderSourceId(
            { workspaceId, provider: "zalo", sourceId: oaId },
            tx,
          )

          const { inbox } = await inboxService.create({
            tx,
            ownerId,
            data: { workspaceId, name, channel: "zalo", sourceId: oaId },
            skipQuota: true,
          })

          await upsertConnectionRow({
            tx,
            workspaceId,
            provider: "zalo",
            kind: "channel",
            descriptor: { sourceId: oaId, displayName: name },
            auth,
            extraConfig: {},
            existing,
            store: CONNECTION_STORE_BINDINGS.zalo as NonNullable<
              (typeof CONNECTION_STORE_BINDINGS)["zalo"]
            >,
            ownerId,
            quotaConsumption,
            inboxId: inbox.id,
          })

          const integration = await findOrFail({
            client: tx,
            table: integrationZaloModel,
            where: { inboxId: inbox.id },
            message: `zaloIntegrationService.connect: IntegrationZalo row missing for inbox ${inbox.id}`,
          })

          return { integrationId: integration.id, wasCreated: !existing }
        }),
    )

    // Import any tags already on the OA into local tags + mappings on a
    // genuinely new connection only — the row is already committed, so a
    // queue outage must not fail the connect (also keeps the caller's audit
    // record reachable: a throw here would leave a connected channel with no
    // audit trail).
    if (wasCreated) {
      await tagSyncService
        .enqueueChannelScan({
          workspaceId,
          channelType: channelTypes.enum.zalo,
          integrationId,
        })
        .catch((err) => {
          logger.warn(
            { err, workspaceId, integrationId },
            "zalo connect: channel tag scan enqueue failed",
          )
        })
    }

    // Last, so the cache is only dropped once every write above has settled.
    await this.invalidateCacheTags(`workspaces:${workspaceId}#zalos`)

    return { integrationId, wasCreated }
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
      await client
        .delete(tagChannelModel)
        .where(
          and(
            eq(tagChannelModel.channelType, channelTypes.enum.zalo),
            eq(tagChannelModel.integrationId, id),
          ),
        )
      await client
        .delete(integrationZaloModel)
        .where(
          and(
            eq(integrationZaloModel.id, id),
            eq(integrationZaloModel.workspaceId, workspaceId),
          ),
        )
      await connectionStateService.disconnectInbox({
        inboxId,
        workspaceId,
        ownerId,
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
      return
    }
    await db.transaction(run)
  }

  /**
   * Unscoped single-row lookup by id — `sync-channel-labels.ts` / `sync-
   * tag.ts` resolve the integration first and only then know its workspace,
   * so no `workspaceId` filter is available at this call site. Distinct
   * name from `findById` above, which requires `workspaceId`.
   */
  async findByIdUnscoped(props: {
    id: string
  }): Promise<IntegrationZaloModel | null> {
    const row = await db.query.integrationZaloModel.findFirst({
      where: { id: props.id },
    })
    return row ?? null
  }

  /** `sync-tag.ts` attach path: resolve the Zalo integration owning an inbox. */
  async findByInboxId(props: { inboxId: string }) {
    const row = await db.query.integrationZaloModel.findFirst({
      where: { inboxId: props.inboxId },
    })
    return row ?? null
  }
}

export const zaloIntegrationService = new ZaloIntegrationService()
