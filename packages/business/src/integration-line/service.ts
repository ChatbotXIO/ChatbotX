import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  and,
  db,
  eq,
  exists,
  findOrFail,
  inArray,
  isUniqueViolationError,
  ne,
  sql,
} from "@chatbotx.io/database/client"
import {
  ACTIVE_CONNECTION_STATUSES,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  connectionModel,
  integrationLineModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationLineModel } from "@chatbotx.io/database/types"
import type { AuthValue, Oauth2AuthValue } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionQuotaConsumption,
  recordRefreshedAuth,
  upsertConnectionRow,
  withQuotaCompensation,
} from "../connection"
import { connectionStateService } from "../connection/state-service"
import {
  ChatbotXException,
  channelDuplicatedException,
  notFoundException,
} from "../errors"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { type WorkspaceQuotaConsumption, workspaceService } from "../workspace"

/**
 * Structural copy of `@chatbotx.io/integration-line`'s `LineAuthValue`
 * (business does not depend on integration packages).
 */
export type LineIntegrationAuth = Oauth2AuthValue & {
  metadata: { botUserId: string; basicId: string }
}

export type LineBotProfile = {
  userId: string
  basicId: string
  displayName: string
  pictureUrl?: string
}

const BOT_USER_ID_UNIQUE_CONSTRAINT = "IntegrationLine_botUserId_key"

class LineIntegrationService extends BaseService {
  /**
   * Rows whose short-lived channel access token expires within `withinMs`
   * (or has no readable expiry) — the scheduled refresh's work list.
   *
   * Only channels whose `Connection` is active (`connected`/`degraded`): a
   * revoked token (`needs_reauth`, set by `markTokenRefreshError`) cannot be
   * refreshed with the same secret, and a paused or disconnected channel has
   * nothing to keep alive. Reconnecting makes the row active again.
   *
   * `expiresAt` is cast only when it looks like an ISO timestamp, so one
   * malformed value cannot fail the whole query (and with it every LINE
   * channel's refresh); such a row counts as due, and its refresh writes a
   * valid expiry back.
   */
  async findDueForRefresh(
    withinMs: number,
  ): Promise<Array<{ id: string; workspaceId: string }>> {
    const threshold = new Date(Date.now() + withinMs).toISOString()
    const expiresAt = sql`${integrationLineModel.auth}->'tokens'->>'expiresAt'`
    return await db
      .select({
        id: integrationLineModel.id,
        workspaceId: integrationLineModel.workspaceId,
      })
      .from(integrationLineModel)
      .where(
        and(
          exists(
            db
              .select({ id: connectionModel.id })
              .from(connectionModel)
              .where(
                and(
                  eq(
                    connectionModel.workspaceId,
                    integrationLineModel.workspaceId,
                  ),
                  eq(connectionModel.provider, integrationTypes.enum.line),
                  eq(connectionModel.sourceId, integrationLineModel.channelId),
                  inArray(connectionModel.status, [
                    ...ACTIVE_CONNECTION_STATUSES,
                  ]),
                ),
              ),
          ),
          sql`case when ${expiresAt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' then (${expiresAt})::timestamptz <= ${threshold}::timestamptz else true end`,
        ),
      )
  }

  findByChannelId(channelId: string): Promise<IntegrationLineModel | null> {
    return db.query.integrationLineModel
      .findFirst({ where: { channelId } })
      .then((row) => row ?? null)
  }

  async listByWorkspace(props: {
    workspaceId: string
  }): Promise<IntegrationLineModel[]> {
    return await db.query.integrationLineModel.findMany({
      where: { workspaceId: props.workspaceId },
      orderBy: { createdAt: "asc" },
    })
  }

  /**
   * Same transaction / revive / duplicate semantics as
   * `telegramIntegrationService.connect`. D3: one workspace per LINE
   * channel — a channel already connected elsewhere throws
   * `channelDuplicated`.
   */
  async connect(input: {
    workspaceId?: string
    ownerId: string
    createdBy: string
    channelId: string
    auth: LineIntegrationAuth
    bot: LineBotProfile
    /** Server-resolved tenant of the request host; see `workspaceService.resolveWorkspaceTenant`. */
    hostTenantId?: string
    onConnected: (ctx: { integrationId: string }) => Promise<void>
  }): Promise<{
    workspaceId: string
    createdWorkspace: boolean
    wasCreated: boolean
    integrationId: string
    inboxId: string
  }> {
    const { createdBy, channelId, auth, bot, onConnected } = input
    let { workspaceId } = input

    // See `telegramIntegrationService.connect`: known before the
    // transaction so quota compensation targets the same owner.
    const createdWorkspace = !workspaceId
    const effectiveOwnerId = createdWorkspace ? createdBy : input.ownerId

    const quotaConsumption: ConnectionQuotaConsumption = {
      consumed: false,
      workspaceUsageIncremented: false,
    }
    const workspaceQuotaConsumption: WorkspaceQuotaConsumption = {
      consumed: false,
    }

    try {
      const result = await withQuotaCompensation(
        {
          ownerId: effectiveOwnerId,
          quotaConsumption,
          workspaceQuotaConsumption,
          context: { provider: "line" },
        },
        () =>
          db.transaction(async (tx) => {
            if (!workspaceId) {
              const workspace = await workspaceService.create({
                tx,
                createdBy,
                data: {
                  name: bot.displayName,
                  timezone: "UTC",
                  ownerId: createdBy,
                },
                quotaConsumption: workspaceQuotaConsumption,
                hostTenantId: input.hostTenantId,
              })
              workspaceId = workspace.id
            }

            if (
              await inboxService.isConnected({
                tx,
                channel: integrationTypes.enum.line,
                sourceId: channelId,
                workspaceId,
              })
            ) {
              throw channelDuplicatedException()
            }

            // Present → this (workspace, channelId) was connected before
            // (even if disconnected), so this is a revive (`wasCreated`).
            const existing = await connectionRepository.findByProviderSourceId(
              { workspaceId, provider: "line", sourceId: channelId },
              tx,
            )

            const { inbox } = await inboxService.create({
              tx,
              ownerId: effectiveOwnerId,
              data: {
                workspaceId,
                name: bot.displayName,
                channel: integrationTypes.enum.line,
                sourceId: channelId,
              },
              skipQuota: true,
            })

            await upsertConnectionRow({
              tx,
              workspaceId,
              provider: "line",
              kind: "channel",
              descriptor: { sourceId: channelId, displayName: bot.displayName },
              auth,
              extraConfig: {},
              existing,
              store: CONNECTION_STORE_BINDINGS.line as NonNullable<
                (typeof CONNECTION_STORE_BINDINGS)["line"]
              >,
              ownerId: effectiveOwnerId,
              quotaConsumption,
              inboxId: inbox.id,
            })

            // Display fields the generic binding does not own: refresh them
            // on both insert and revive, and clear a stale refresh error.
            const [integration] = await tx
              .update(integrationLineModel)
              .set({
                name: bot.displayName,
                pictureUrl: bot.pictureUrl ?? null,
                tokenRefreshError: null,
              })
              .where(
                and(
                  eq(integrationLineModel.inboxId, inbox.id),
                  eq(integrationLineModel.workspaceId, workspaceId),
                ),
              )
              .returning({ id: integrationLineModel.id })
            if (!integration) {
              throw new Error(
                `lineIntegrationService.connect: IntegrationLine row missing for inbox ${inbox.id}`,
              )
            }

            await onConnected({ integrationId: integration.id })

            return {
              workspaceId,
              wasCreated: !existing,
              integrationId: integration.id,
              inboxId: inbox.id,
            }
          }),
      )

      return { ...result, createdWorkspace }
    } catch (error) {
      throw await this.toDuplicateError(error, {
        channelId,
        workspaceId,
      })
    }
  }

  /**
   * A unique violation on the channel/bot identity means another workspace
   * already holds this LINE channel (e.g. a stale row whose inbox is not
   * `connected`, which the `isConnected` pre-check skips). The engine maps
   * the `channelId` violation to `connectionAlreadyConnected`; surface both
   * as `channelDuplicated` when the row really belongs elsewhere.
   */
  private async toDuplicateError(
    error: unknown,
    ctx: { channelId: string; workspaceId: string | undefined },
  ): Promise<unknown> {
    if (isUniqueViolationError(error, BOT_USER_ID_UNIQUE_CONSTRAINT)) {
      return channelDuplicatedException()
    }
    if (
      error instanceof ChatbotXException &&
      error.code === "connectionAlreadyConnected" &&
      ctx.workspaceId
    ) {
      const [elsewhere] = await db
        .select({ id: integrationLineModel.id })
        .from(integrationLineModel)
        .where(
          and(
            eq(integrationLineModel.channelId, ctx.channelId),
            ne(integrationLineModel.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1)
      if (elsewhere) {
        return channelDuplicatedException()
      }
    }
    return error
  }

  /**
   * D15: mirrors Telegram — deletes the satellite row and disconnects the
   * inbox; the `Connection` row stays so a reconnect revives it. LINE has
   * no webhook "unset"; events for the now-unknown channelId are acked and
   * dropped by the webhook route.
   */
  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      await client
        .delete(integrationLineModel)
        .where(
          and(
            eq(integrationLineModel.id, id),
            eq(integrationLineModel.workspaceId, workspaceId),
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

  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationLineModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration LINE not found",
    })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationLineModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  async updateAuth(props: {
    id: string
    workspaceId: string
    auth: Record<string, unknown>
  }): Promise<void> {
    const [row] = await db
      .update(integrationLineModel)
      .set({ auth: props.auth, tokenRefreshError: null })
      .where(
        and(
          eq(integrationLineModel.id, props.id),
          eq(integrationLineModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({
        channelId: integrationLineModel.channelId,
        workspaceId: integrationLineModel.workspaceId,
      })
    if (!row) {
      throw notFoundException("LINE integration not found")
    }
    await recordRefreshedAuth({
      workspaceId: row.workspaceId,
      provider: "line",
      sourceId: row.channelId,
      auth: props.auth as AuthValue,
    })
  }

  async markTokenRefreshError(props: {
    id: string
    workspaceId: string
    error: string
    isRevoked: boolean
  }): Promise<void> {
    const [row] = await db
      .update(integrationLineModel)
      .set({ tokenRefreshError: props.error })
      .where(
        and(
          eq(integrationLineModel.id, props.id),
          eq(integrationLineModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ channelId: integrationLineModel.channelId })

    if (!row) {
      logger.warn(
        { integrationId: props.id, workspaceId: props.workspaceId },
        "Unable to mark LINE token refresh error: integration not found",
      )
      return
    }

    if (props.isRevoked) {
      await connectionStateService.markUnhealthyByIdentifier({
        provider: "line",
        identifier: row.channelId,
        workspaceId: props.workspaceId,
        reason: "token_revoked",
      })
      return
    }

    await connectionStateService.markDegradedByIdentifier({
      provider: "line",
      identifier: row.channelId,
      workspaceId: props.workspaceId,
      reason: "refresh_failed",
    })
  }
}

export const lineIntegrationService = new LineIntegrationService()
