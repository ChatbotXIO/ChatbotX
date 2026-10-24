import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  liftDecompressionLimit,
  sql,
} from "@chatbotx.io/database/client"
import {
  channelTypes,
  type InboxDisconnectReason,
} from "@chatbotx.io/database/partials"
import {
  connectionRepository,
  LIVE_RUN_STATUSES,
  leaderboardScoreEventRepository,
  PULL_CLAIMABLE_STATUSES,
} from "@chatbotx.io/database/repositories"
import {
  attachmentModel,
  coexistSyncRunModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationThreadsModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
  messageModel,
  tagChannelModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
// Subpath, not the barrel: the barrel re-exports `dispatch-manager`, whose
// bucket hashing imports Node's `crypto`. This module ends up in the builder's
// Edge bundle (instrumentation → oRPC → workspace token auth → workspace
// service), where a Node built-in is a hard compile error.
import {
  cancelPendingDispatchBatch,
  MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES,
  removeDispatchesFromSchedule,
  WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE,
} from "@chatbotx.io/sequence-scheduler/dispatch-cancel"
import { BaseService } from "../base.service"
import { coexistService } from "../coexist/service"
import type { ConnectionEvent } from "../connection/state"
import {
  connectionStateService,
  type PendingQuotaRelease,
} from "../connection/state-service"
import { WorkspacePurgeIncompleteError } from "../errors"
import { inboxService } from "../inbox/service"
import { integrationActiveCampaignService } from "../integration-active-campaign/service"
import { integrationClaudeService } from "../integration-claude/service"
import { integrationDeepSeekService } from "../integration-deepseek/service"
import { integrationDripService } from "../integration-drip/service"
import { integrationGeminiService } from "../integration-gemini/service"
import { integrationGetResponseService } from "../integration-get-response/service"
import { integrationKlaviyoService } from "../integration-klaviyo/service"
import { integrationMailchimpService } from "../integration-mailchimp/service"
import { integrationMailerLiteService } from "../integration-mailer-lite/service"
import { integrationMoosendService } from "../integration-moosend/service"
import { integrationOpenAIService } from "../integration-openai/service"
import { integrationOpenRouterService } from "../integration-openrouter/service"
import { integrationSendGridService } from "../integration-sendgrid/service"
import { purgeLeaderboardDataForWorkspace } from "../leaderboard/purge"
import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"
import {
  cancelInFlightBroadcastsForWorkspace,
  completeActiveSequenceEnrollmentsForWorkspace,
  MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES,
  SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE,
} from "./campaign-cleanup"
import { cancelSmartDelaysForWorkspace } from "./smart-delay-cleanup"

type WorkspaceTeardownIntegration = {
  disconnect(auth: unknown): Promise<void>
  isRevokedTokenError?: (error: unknown) => boolean
}

type DisconnectService = {
  disconnect(workspaceId: string): Promise<void>
}

type PurgePartitionedTable = {
  primaryKey: readonly string[]
  selector: "broadcastWorkspace" | "workspace"
  table: "ContactOnBroadcast" | "SequenceDispatch"
}

export type WorkspaceTeardownIntegrations = Record<
  string,
  WorkspaceTeardownIntegration | undefined
>

export type WorkspaceTeardownLevel = "pause" | "disconnect"

/**
 * `disconnectWorkspaceChannels`'s result: `pendingReleases` carries every
 * `channels` quota release `connectionStateService.transition` deferred
 * (via its `pendingRelease` handshake) across every connection-backed inbox
 * this call processed — the caller must release each one (via
 * `connectionStateService.releasePendingQuota`) only once `tx` (if the
 * caller supplied its own) has actually committed; otherwise a later
 * statement in that same transaction rolling back would under-count the
 * release.
 */
export type WorkspaceChannelsTeardownResult = {
  disconnected: number
  pendingReleases: PendingQuotaRelease[]
}

/**
 * High-volume tables that carry a direct `workspaceId` FK, ordered
 * children-before-parents so each batched delete respects referential
 * integrity on its own (independent of the deferred cascade). A workspace can
 * hold millions of messages/contacts; deleting them via the single
 * `DELETE FROM "Workspace"` FK cascade would scan every child table inside one
 * transaction, holding locks and bloating WAL. Instead we drain these tables
 * in small `ctid`-bounded chunks — one short autocommit statement each — and
 * leave the remaining low-volume tables to the final cascade.
 *
 * Table names are the physical PG identifiers (not Drizzle models) because the
 * delete is a raw `ctid IN (... LIMIT ...)` statement the query builder cannot
 * express; keep them in sync with the schema if a table is renamed.
 *
 * `Message` and `Attachment` are deliberately NOT here: they are compressed
 * TimescaleDB hypertables where `ctid` is unavailable ("transparent
 * decompression only supports tableoid system column"). They are drained
 * separately by `deleteWorkspaceHypertableRows`, which deletes by the
 * `conversationId` segmentby column with the decompression cap lifted — the
 * same technique as `messageCleanupService.purgeRow`.
 */
const HEAVY_WORKSPACE_TABLES = [
  "ErrorLog",
  "AuditLog",
  "InboundWebhookRequest",
  "CommentAutomationEvent",
  "CommentAutomationReply",
  "TriggerStat",
  "FlowNodeStat",
  "MagicLinkStat",
  "RefLinkStat",
  "MetaCapiEvent",
  "AdsConversionEvent",
  "GoogleAdsConversionEvent",
  "LeaderboardAuditLog",
  "LeaderboardParticipant",
  "AIConversationEmbedding",
  "AIEmbedding",
  "TriggerExecution",
  "FlowRun",
  "FlowVersion",
  "ContactOnSmartDelay",
  "Conversation",
  "Contact",
] as const

const HEAVY_WORKSPACE_PARTITIONED_TABLES = [
  {
    primaryKey: ["broadcastId", "contactId"],
    selector: "broadcastWorkspace",
    table: "ContactOnBroadcast",
  },
  {
    primaryKey: ["id", "workspaceId"],
    selector: "workspace",
    table: "SequenceDispatch",
  },
] as const satisfies readonly PurgePartitionedTable[]

const HEAVY_PURGE_BATCH_SIZE = 5000
const HEAVY_PURGE_BATCH_SIZES: Partial<
  Record<(typeof HEAVY_WORKSPACE_TABLES)[number], number>
> = {
  Contact: 1000,
  Conversation: 1000,
}
const INTER_CHUNK_DELAY_MS = 100
const HYPERTABLE_CONVERSATION_BATCH_SIZE = 10
const HEAVY_PURGE_MAX_BATCHES_PER_TABLE = 2000
const HYPERTABLE_MAX_CONVERSATION_BATCHES = 1000
const ANALYTICS_HYPERTABLE_MAX_CHUNKS = 100
const PURGE_LOCK_TIMEOUT = "2s"
const PURGE_STATEMENT_TIMEOUT = "30s"
const WORKSPACE_ANALYTICS_HYPERTABLES = [
  "AnalyticsAgentResponseEvent",
  "AnalyticsBotMessageEvent",
  "AnalyticsBroadcastEvent",
  "AnalyticsContactEvent",
  "AnalyticsConversationEvent",
  "AnalyticsFlowNodeEvent",
  "AnalyticsMessageEvent",
  "AnalyticsSequenceEvent",
] as const
const pause = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

const assertPurgeDeadline = (
  deadlineAt: number | undefined,
  workspaceId: string,
  table: string,
): void => {
  if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
    throw new WorkspacePurgeIncompleteError(workspaceId, table)
  }
}

const getPostgresErrorCode = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return
  }
  return value.code
}

const isPurgeTimeoutError = (err: unknown): boolean => {
  const code =
    getPostgresErrorCode(err) ??
    getPostgresErrorCode(err instanceof Error ? err.cause : undefined)
  return code === "55P03" || code === "57014"
}

export const withPurgeTimeouts = async <T>(props: {
  fn: (tx: DatabaseClient) => Promise<T>
  table: string
  workspaceId: string
}): Promise<T> => {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SET LOCAL lock_timeout = ${sql.raw(`'${PURGE_LOCK_TIMEOUT}'`)}`,
      )
      await tx.execute(
        sql`SET LOCAL statement_timeout = ${sql.raw(`'${PURGE_STATEMENT_TIMEOUT}'`)}`,
      )
      return await props.fn(tx)
    })
  } catch (err) {
    if (!isPurgeTimeoutError(err)) {
      throw err
    }
    logger.info(
      { table: props.table, workspaceId: props.workspaceId },
      "workspace-purge: timed out, deferring to next run",
    )
    throw new WorkspacePurgeIncompleteError(props.workspaceId, props.table)
  }
}

class WorkspaceLifecycleService extends BaseService {
  async disconnectWorkspaceChannels(props: {
    workspaceId: string
    ownerId: string
    reason: InboxDisconnectReason
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
    tx?: DatabaseClient
  }): Promise<WorkspaceChannelsTeardownResult> {
    const { tx = db } = props
    const inboxes = await inboxService.listWithIntegrationsByWorkspace(
      props.workspaceId,
      tx,
    )

    let disconnected = 0
    const pendingReleases: PendingQuotaRelease[] = []
    for (const inbox of inboxes) {
      await this.disconnectWorkspaceInbox({
        inbox,
        ownerId: props.ownerId,
        reason: props.reason,
        integrations: props.integrations,
        teardownLevel: props.teardownLevel ?? "disconnect",
        tx,
        pendingReleases,
      })
      disconnected += 1
    }

    return { disconnected, pendingReleases }
  }

  async disconnectWorkspaceIntegrations(workspaceId: string): Promise<void> {
    // Every non-channel integration (marketing/email providers + AI provider
    // keys). AI providers were extracted into their own services in the same
    // change that added this teardown; keep this list exhaustive so a purge
    // does not leave orphaned provider rows behind for `teardownLevel: "pause"`
    // (where the workspace row — and its FK cascade — is not deleted).
    const providers: [name: string, service: DisconnectService][] = [
      ["active-campaign", integrationActiveCampaignService],
      ["claude", integrationClaudeService],
      ["deepseek", integrationDeepSeekService],
      ["drip", integrationDripService],
      ["gemini", integrationGeminiService],
      ["get-response", integrationGetResponseService],
      ["klaviyo", integrationKlaviyoService],
      ["mailchimp", integrationMailchimpService],
      ["mailer-lite", integrationMailerLiteService],
      ["moosend", integrationMoosendService],
      ["openai", integrationOpenAIService],
      ["openrouter", integrationOpenRouterService],
      ["sendgrid", integrationSendGridService],
    ]

    const results = await Promise.allSettled(
      providers.map(([, service]) => service.disconnect(workspaceId)),
    )

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          {
            err: result.reason,
            workspaceId,
            provider: providers[index]?.[0],
          },
          "workspace-teardown: integration cleanup failed",
        )
      }
    })
  }

  /**
   * Disarms everything a workspace has scheduled to fire on its own: in-flight
   * broadcasts, active sequence enrollments and their queued dispatches, plus
   * pending/scheduled smart delays (wait steps and follow-ups).
   *
   * Called once deletion is due, and when the owner's entitlement is torn down.
   * The runtime guards (`withBlockedOwnerGuard`) would no-op these jobs anyway,
   * but they would keep waking for the whole teardown — and the smart-delay
   * scanner would churn them through claim → drop → reset every tick. Cancelling
   * the rows is what makes the terminal teardown quiet as well as safe.
   *
   * Each source is independent and best-effort: a Redis failure on one must not
   * leave the others armed.
   */
  async freezeWorkspaceRuntime(
    workspaceId: string,
    deadlineAt?: number,
  ): Promise<void> {
    await withPurgeTimeouts({
      fn: async (tx) =>
        await cancelInFlightBroadcastsForWorkspace({ tx, workspaceId }),
      table: "Broadcast",
      workspaceId,
    })

    try {
      let completedEnrollments = 0
      for (
        let batch = 0;
        batch < MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES;
        batch += 1
      ) {
        assertPurgeDeadline(deadlineAt, workspaceId, "ContactOnSequence")
        const completed = await withPurgeTimeouts({
          fn: async (tx) =>
            await completeActiveSequenceEnrollmentsForWorkspace({
              tx,
              workspaceId,
            }),
          table: "ContactOnSequence",
          workspaceId,
        })
        completedEnrollments += completed
        if (completed < SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE) {
          break
        }
        if (batch === MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES - 1) {
          throw new WorkspacePurgeIncompleteError(
            workspaceId,
            "ContactOnSequence",
          )
        }
      }
      logger.info(
        { completedEnrollments, workspaceId },
        "workspace-freeze: completed sequence enrollments",
      )
    } catch (err) {
      if (deadlineAt || err instanceof WorkspacePurgeIncompleteError) {
        throw err
      }
      logger.warn(
        { err, workspaceId },
        "workspace-freeze: failed to complete sequence enrollments",
      )
    }
    try {
      let canceledDispatches = 0
      for (
        let batch = 0;
        batch < MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES;
        batch += 1
      ) {
        assertPurgeDeadline(deadlineAt, workspaceId, "SequenceDispatch")
        const dispatches = await withPurgeTimeouts({
          fn: async (tx) =>
            await cancelPendingDispatchBatch({
              client: tx,
              workspaceId,
            }),
          table: "SequenceDispatch",
          workspaceId,
        })
        canceledDispatches += dispatches.length
        if (dispatches.length === 0) {
          break
        }
        await removeDispatchesFromSchedule(dispatches)
        if (dispatches.length < WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE) {
          break
        }
        if (batch === MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES - 1) {
          throw new WorkspacePurgeIncompleteError(
            workspaceId,
            "SequenceDispatch",
          )
        }
      }
      logger.info(
        { canceledDispatches, workspaceId },
        "workspace-freeze: canceled sequence dispatches",
      )
    } catch (err) {
      if (deadlineAt || err instanceof WorkspacePurgeIncompleteError) {
        throw err
      }
      logger.warn(
        { err, workspaceId },
        "workspace-freeze: failed to cancel sequence dispatches",
      )
    }

    try {
      assertPurgeDeadline(deadlineAt, workspaceId, "ContactOnSmartDelay")
      const canceledSmartDelays = await cancelSmartDelaysForWorkspace({
        workspaceId,
      })
      logger.info(
        { canceledSmartDelays, workspaceId },
        "workspace-freeze: canceled smart delays",
      )
    } catch (err) {
      if (deadlineAt) {
        throw err
      }
      logger.warn(
        { err, workspaceId },
        "workspace-freeze: failed to cancel smart delays",
      )
    }
  }

  /**
   * Drain a workspace's high-volume child tables in small, self-committing
   * batches before the workspace row itself is deleted. Each batch is its own
   * statement (run on `db`, never a caller transaction) so row locks and WAL
   * are released between chunks — the deletion stays smooth under production
   * load instead of one multi-million-row cascade. Idempotent and resumable: a
   * partially-drained workspace simply continues on the next call.
   */
  async purgeWorkspaceHeavyData(props: {
    batchSize?: number
    deadlineAt?: number
    workspaceId: string
  }): Promise<number> {
    const defaultBatchSize = props.batchSize ?? HEAVY_PURGE_BATCH_SIZE
    let totalDeleted = 0

    totalDeleted += await this.deleteWorkspaceAnalyticsRows(
      props.workspaceId,
      props.deadlineAt,
    )
    totalDeleted += await this.deleteWorkspaceHypertableRows(
      props.workspaceId,
      props.deadlineAt,
    )

    for (const table of HEAVY_WORKSPACE_PARTITIONED_TABLES) {
      assertPurgeDeadline(props.deadlineAt, props.workspaceId, table.table)
      totalDeleted += await this.drainPartitionedHeavyTable(
        table,
        props.workspaceId,
        defaultBatchSize,
        props.deadlineAt,
      )
    }

    const leaderboardPurge = await purgeLeaderboardDataForWorkspace(
      props.workspaceId,
      {
        batchSize: defaultBatchSize,
        deadlineAt: props.deadlineAt,
        deleteBatch: async () =>
          await withPurgeTimeouts({
            fn: async (tx) =>
              await leaderboardScoreEventRepository.deleteBatchByWorkspace(
                {
                  limit: defaultBatchSize,
                  workspaceId: props.workspaceId,
                },
                tx,
              ),
            table: "LeaderboardScoreEvent",
            workspaceId: props.workspaceId,
          }),
      },
    )
    totalDeleted += leaderboardPurge.deleted
    if (!leaderboardPurge.complete) {
      throw new WorkspacePurgeIncompleteError(
        props.workspaceId,
        "LeaderboardScoreEvent",
      )
    }

    for (const table of HEAVY_WORKSPACE_TABLES) {
      assertPurgeDeadline(props.deadlineAt, props.workspaceId, table)
      const batchSize = HEAVY_PURGE_BATCH_SIZES[table] ?? defaultBatchSize
      for (let batch = 0; batch < HEAVY_PURGE_MAX_BATCHES_PER_TABLE; batch++) {
        assertPurgeDeadline(props.deadlineAt, props.workspaceId, table)
        const deleted = await this.deleteHeavyBatch(
          table,
          props.workspaceId,
          batchSize,
        )
        totalDeleted += deleted
        if (deleted < batchSize) {
          break
        }
        await pause(INTER_CHUNK_DELAY_MS)
      }

      if (await this.hasHeavyRows(table, props.workspaceId)) {
        throw new WorkspacePurgeIncompleteError(props.workspaceId, table)
      }
    }

    return totalDeleted
  }

  private async drainPartitionedHeavyTable(
    table: PurgePartitionedTable,
    workspaceId: string,
    batchSize: number,
    deadlineAt?: number,
  ): Promise<number> {
    let deletedTotal = 0
    for (let batch = 0; batch < HEAVY_PURGE_MAX_BATCHES_PER_TABLE; batch++) {
      assertPurgeDeadline(deadlineAt, workspaceId, table.table)
      const deleted = await this.deletePartitionedHeavyBatch(
        table,
        workspaceId,
        batchSize,
      )
      deletedTotal += deleted
      if (deleted < batchSize) {
        break
      }
      await pause(INTER_CHUNK_DELAY_MS)
    }
    if (await this.hasPartitionedHeavyRows(table, workspaceId)) {
      throw new WorkspacePurgeIncompleteError(workspaceId, table.table)
    }
    return deletedTotal
  }

  private async deletePartitionedHeavyBatch(
    table: PurgePartitionedTable,
    workspaceId: string,
    batchSize: number,
  ): Promise<number> {
    return await withPurgeTimeouts({
      table: table.table,
      workspaceId,
      fn: async (tx) => {
        const result =
          table.selector === "broadcastWorkspace"
            ? await tx.execute(sql`
                DELETE FROM "ContactOnBroadcast"
                WHERE ("broadcastId", "contactId") IN (
                  SELECT recipient."broadcastId", recipient."contactId"
                  FROM "ContactOnBroadcast" AS recipient
                  INNER JOIN "Broadcast" AS broadcast
                    ON broadcast."id" = recipient."broadcastId"
                  WHERE broadcast."workspaceId" = ${workspaceId}
                  LIMIT ${batchSize}
                )
              `)
            : await tx.execute(sql`
                DELETE FROM "SequenceDispatch"
                WHERE ("id", "workspaceId") IN (
                  SELECT "id", "workspaceId"
                  FROM "SequenceDispatch"
                  WHERE "workspaceId" = ${workspaceId}
                  LIMIT ${batchSize}
                )
              `)
        return result.rowCount ?? 0
      },
    })
  }

  private async hasPartitionedHeavyRows(
    table: PurgePartitionedTable,
    workspaceId: string,
  ): Promise<boolean> {
    const result =
      table.selector === "broadcastWorkspace"
        ? await db.execute(sql`
            SELECT 1
            FROM "ContactOnBroadcast" AS recipient
            INNER JOIN "Broadcast" AS broadcast
              ON broadcast."id" = recipient."broadcastId"
            WHERE broadcast."workspaceId" = ${workspaceId}
            LIMIT 1
          `)
        : await db.execute(sql`
            SELECT 1
            FROM "SequenceDispatch"
            WHERE "workspaceId" = ${workspaceId}
            LIMIT 1
          `)
    return result.rows.length > 0
  }

  private async deleteHeavyBatch(
    table: (typeof HEAVY_WORKSPACE_TABLES)[number],
    workspaceId: string,
    batchSize: number,
  ): Promise<number> {
    return await withPurgeTimeouts({
      table,
      workspaceId,
      fn: async (tx) => {
        const result = await tx.execute(sql`
          DELETE FROM ${sql.raw(`"${table}"`)}
          WHERE "ctid" IN (
            SELECT "ctid" FROM ${sql.raw(`"${table}"`)}
            WHERE "workspaceId" = ${workspaceId}
            LIMIT ${batchSize}
          )
        `)
        return result.rowCount ?? 0
      },
    })
  }

  private async hasHeavyRows(
    table: (typeof HEAVY_WORKSPACE_TABLES)[number],
    workspaceId: string,
  ): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1
      FROM ${sql.raw(`"${table}"`)}
      WHERE "workspaceId" = ${workspaceId}
      LIMIT 1
    `)
    return result.rows.length > 0
  }
  private async deleteWorkspaceAnalyticsRows(
    workspaceId: string,
    deadlineAt?: number,
  ): Promise<number> {
    let deleted = 0

    for (const table of WORKSPACE_ANALYTICS_HYPERTABLES) {
      for (let batch = 0; batch < ANALYTICS_HYPERTABLE_MAX_CHUNKS; batch++) {
        assertPurgeDeadline(deadlineAt, workspaceId, table)
        const chunks = await db.execute<{
          range_end: Date
          range_start: Date
        }>(sql`
          WITH next_workspace_row AS (
            SELECT "occurredAt"
            FROM ${sql.raw(`"${table}"`)}
            WHERE "workspaceId" = ${workspaceId}
            ORDER BY "occurredAt" ASC
            LIMIT 1
          )
          SELECT chunks.range_start, chunks.range_end
          FROM timescaledb_information.chunks AS chunks
          INNER JOIN next_workspace_row AS next_row
            ON next_row."occurredAt" >= chunks.range_start
            AND next_row."occurredAt" < chunks.range_end
          WHERE chunks.hypertable_schema = 'public'
            AND chunks.hypertable_name = ${table}
          LIMIT 1
        `)
        const chunk = chunks.rows[0]
        if (!chunk) {
          break
        }

        deleted += await withPurgeTimeouts({
          table,
          workspaceId,
          fn: async (tx) => {
            await liftDecompressionLimit(tx)
            const result = await tx.execute(sql`
              DELETE FROM ${sql.raw(`"${table}"`)}
              WHERE "workspaceId" = ${workspaceId}
                AND "occurredAt" >= ${chunk.range_start}
                AND "occurredAt" < ${chunk.range_end}
            `)
            return result.rowCount ?? 0
          },
        })
      }

      if (await this.hasWorkspaceRows(table, workspaceId)) {
        throw new WorkspacePurgeIncompleteError(workspaceId, table)
      }
    }

    return deleted
  }

  private async hasWorkspaceRows(
    table: (typeof WORKSPACE_ANALYTICS_HYPERTABLES)[number],
    workspaceId: string,
  ): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1
      FROM ${sql.raw(`"${table}"`)}
      WHERE "workspaceId" = ${workspaceId}
      LIMIT 1
    `)
    return result.rows.length > 0
  }

  /**
   * Delete a workspace's Message + Attachment rows. Both are compressed
   * TimescaleDB hypertables (segmentby `workspaceId,conversationId`) where
   * `ctid` is unsupported, so `deleteHeavyBatch` cannot touch them. Instead we
   * drain them one bounded page of conversationIds at a time: deleting a page
   * lifts the per-statement decompression cap for that transaction only, and the
   * deleted ids drop out so the next page query walks forward to the next ones.
   *
   * Paging (rather than loading every conversationId up front) keeps worker
   * memory constant — a workspace can hold millions of conversations, and
   * materialising that whole id list in the process could exhaust its heap.
   * Message is drained first (high volume), then any attachment-only
   * conversations left behind. The whole workspace is being torn down, so no
   * `createdAt` upper bound is needed.
   */
  private async deleteWorkspaceHypertableRows(
    workspaceId: string,
    deadlineAt?: number,
  ): Promise<number> {
    const deletePage = async (conversationIds: string[]): Promise<number> =>
      await withPurgeTimeouts({
        table: "Message/Attachment",
        workspaceId,
        fn: async (tx) => {
          await liftDecompressionLimit(tx)
          const messageResult = await tx
            .delete(messageModel)
            .where(
              and(
                eq(messageModel.workspaceId, workspaceId),
                inArray(messageModel.conversationId, conversationIds),
              ),
            )
          const attachmentResult = await tx
            .delete(attachmentModel)
            .where(
              and(
                eq(attachmentModel.workspaceId, workspaceId),
                inArray(attachmentModel.conversationId, conversationIds),
              ),
            )
          return (
            (messageResult.rowCount ?? 0) + (attachmentResult.rowCount ?? 0)
          )
        },
      })

    let deleted = 0

    // Pass 1: discovery driven off Message (the high-volume table). Each deleted
    // page removes those conversationIds, so re-querying with the same LIMIT
    // walks forward until none remain. The batch cap bounds a single run; any
    // residue drains on the next scheduled tick.
    for (let batch = 0; batch < HYPERTABLE_MAX_CONVERSATION_BATCHES; batch++) {
      assertPurgeDeadline(deadlineAt, workspaceId, "Message")
      const rows = await db
        .selectDistinct({ conversationId: messageModel.conversationId })
        .from(messageModel)
        .where(eq(messageModel.workspaceId, workspaceId))
        // Ordered so Postgres can serve each page from the (workspaceId,
        // conversationId) index as a bounded scan instead of re-aggregating the
        // whole workspace on every batch.
        .orderBy(messageModel.conversationId)
        .limit(HYPERTABLE_CONVERSATION_BATCH_SIZE)
      if (rows.length === 0) {
        break
      }
      deleted += await deletePage(rows.map((row) => row.conversationId))
      await pause(INTER_CHUNK_DELAY_MS)
    }

    if (await this.hasHypertableRows(messageModel, workspaceId)) {
      throw new WorkspacePurgeIncompleteError(workspaceId, "Message")
    }

    // Pass 2: attachment-only conversations (attachments whose Message rows were
    // already gone) that pass 1 never enumerated.
    for (let batch = 0; batch < HYPERTABLE_MAX_CONVERSATION_BATCHES; batch++) {
      assertPurgeDeadline(deadlineAt, workspaceId, "Attachment")
      const rows = await db
        .selectDistinct({ conversationId: attachmentModel.conversationId })
        .from(attachmentModel)
        .where(eq(attachmentModel.workspaceId, workspaceId))
        .orderBy(attachmentModel.conversationId)
        .limit(HYPERTABLE_CONVERSATION_BATCH_SIZE)
      if (rows.length === 0) {
        break
      }
      deleted += await deletePage(rows.map((row) => row.conversationId))
      await pause(INTER_CHUNK_DELAY_MS)
    }

    if (await this.hasHypertableRows(attachmentModel, workspaceId)) {
      throw new WorkspacePurgeIncompleteError(workspaceId, "Attachment")
    }

    return deleted
  }

  private async hasHypertableRows(
    model: typeof messageModel | typeof attachmentModel,
    workspaceId: string,
  ): Promise<boolean> {
    const rows = await db
      .selectDistinct({ conversationId: model.conversationId })
      .from(model)
      .where(eq(model.workspaceId, workspaceId))
      .limit(1)
    return rows.length > 0
  }

  /** Returns the ids of the owner's workspaces this call tore down, so callers that need to attribute a per-workspace side effect (e.g. audit rows) don't have to re-query. */
  async deactivateOwnerWorkspaces(props: {
    ownerId: string
    reason: InboxDisconnectReason
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
  }): Promise<string[]> {
    const workspaces = await db.query.workspaceModel.findMany({
      where: { ownerId: props.ownerId },
      columns: { id: true, tenantId: true },
    })

    if (workspaces.length === 0) {
      return []
    }

    const teardownLevel = props.teardownLevel ?? "pause"
    for (const workspace of workspaces) {
      const { pendingReleases } = await this.disconnectWorkspaceChannels({
        integrations: props.integrations,
        teardownLevel,
        reason: props.reason,
        workspaceId: workspace.id,
        ownerId: props.ownerId,
      })
      // No enclosing transaction owns this call — nothing to wait on, so
      // release each deferred `channels` quota unit right away (same
      // timing `transition` used before the `pendingRelease` handshake
      // existed).
      for (const pendingRelease of pendingReleases) {
        await connectionStateService.releasePendingQuota(pendingRelease)
      }
      if (teardownLevel === "disconnect") {
        await this.disconnectWorkspaceIntegrations(workspace.id)
      }
    }

    await userQuotaService.reconcileOwnerAfterTeardown(props.ownerId)

    return workspaces.map((workspace) => workspace.id)
  }

  private async disconnectWorkspaceInbox(props: {
    inbox: InboxWithIntegrations
    ownerId: string
    reason: InboxDisconnectReason
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel: WorkspaceTeardownLevel
    tx: DatabaseClient
    /** Shared accumulator across every inbox `disconnectWorkspaceChannels` processes in this call — see `WorkspaceChannelsTeardownResult`. */
    pendingReleases: PendingQuotaRelease[]
  }): Promise<void> {
    const { inbox, ownerId, reason, integrations, teardownLevel, tx } = props
    const removeIntegrationRow = teardownLevel === "disconnect"

    const finish = async (disconnect?: WorkspaceTeardownIntegration) => {
      const auth = inboxToAuth(inbox)
      let isTokenRevoked = false
      // Skip the provider call when the integration/auth row is already gone:
      // there are no credentials to disconnect with, and passing an undefined
      // auth crashes providers that read it (e.g. messenger/whatsapp reach into
      // `auth.metadata`). Removing the inbox row below is still done.
      if (disconnect && auth) {
        try {
          await disconnect.disconnect(auth)
        } catch (err) {
          isTokenRevoked = Boolean(disconnect.isRevokedTokenError?.(err))
          if (!isTokenRevoked) {
            logger.error(
              { err, inboxId: inbox.id, workspaceId: inbox.workspaceId },
              "workspace-teardown: provider disconnect failed",
            )
          }
        }
      }

      // A tenant-suspend teardown must stay on `teardown.pause` with
      // `tenant_suspended` even when the provider call failed because the
      // token was already revoked remotely: the suspend flow, not the
      // provider response, decides pause vs. disconnect. Only non-suspend
      // teardowns (trial expiry, purge, manual) adopt `token_revoked` as the
      // more specific reason.
      const resolvedReason =
        isTokenRevoked && reason !== "tenant_suspended"
          ? "token_revoked"
          : reason

      // This is the community-edition forensic trail: audit is gated off
      // outside cloud/enterprise, so this structured log is the only record
      // of an automated teardown on every edition.
      logger.info(
        {
          inboxId: inbox.id,
          workspaceId: inbox.workspaceId,
          ownerId,
          channel: inbox.channel,
          teardownLevel,
          reason: resolvedReason,
        },
        "workspace-teardown: inbox disconnected",
      )

      // Connection-backed inboxes route their local status write through the
      // engine: `transition` already mirrors `Inbox.status` and
      // consumes/releases `channels` quota exactly once, so calling
      // `inboxService.disconnect` afterward would double-write both. A
      // pre-backfill inbox (no `Connection` row yet) falls back to the
      // legacy direct write — same pattern as `disconnectInbox`'s existing
      // fallback in `ConnectionStateService`.
      const connection = await connectionRepository.findByInboxId(
        { inboxId: inbox.id },
        tx,
      )
      if (connection) {
        const event: ConnectionEvent =
          resolvedReason === "tenant_suspended"
            ? "teardown.pause"
            : "teardown.disconnect"
        // Deferred via the `pendingRelease` handshake: this call's `tx` may
        // be a transaction a caller further up owns (one that does more
        // work after this inbox, or after this call returns) — only that
        // caller knows when it actually commits, so `disconnectWorkspaceChannels`
        // bubbles this up through `pendingReleases` instead of releasing it
        // here.
        const pendingRelease: { current: PendingQuotaRelease | null } = {
          current: null,
        }
        await connectionStateService.transition({
          connectionId: connection.id,
          event,
          reason: resolvedReason,
          ownerId,
          tx,
          pendingRelease,
        })
        if (pendingRelease.current) {
          props.pendingReleases.push(pendingRelease.current)
        }
        return
      }

      await inboxService.disconnect({
        inboxId: inbox.id,
        ownerId,
        workspaceId: inbox.workspaceId,
        reason: resolvedReason,
        tx,
      })
    }

    switch (inbox.channel) {
      case channelTypes.enum.messenger: {
        if (removeIntegrationRow && inbox.integrationMessenger) {
          await tx
            .update(coexistSyncRunModel)
            .set({
              status: "failed",
              finishedAt: new Date(),
              currentError: "Integration disconnected",
            })
            .where(
              and(
                eq(
                  coexistSyncRunModel.integrationId,
                  inbox.integrationMessenger.id,
                ),
                inArray(coexistSyncRunModel.status, PULL_CLAIMABLE_STATUSES),
              ),
            )
          await tx
            .delete(tagChannelModel)
            .where(
              and(
                eq(tagChannelModel.channelType, channelTypes.enum.messenger),
                eq(
                  tagChannelModel.integrationId,
                  inbox.integrationMessenger.id,
                ),
              ),
            )
          await tx
            .delete(integrationMessengerModel)
            .where(
              eq(integrationMessengerModel.id, inbox.integrationMessenger.id),
            )
        }
        await finish(integrations?.messenger)
        return
      }
      case channelTypes.enum.whatsapp: {
        if (removeIntegrationRow && inbox.integrationWhatsapp) {
          await tx
            .update(coexistSyncRunModel)
            .set({
              status: "failed",
              finishedAt: new Date(),
              currentError: "Integration disconnected",
            })
            .where(
              and(
                eq(
                  coexistSyncRunModel.integrationId,
                  inbox.integrationWhatsapp.id,
                ),
                // `waiting` included: a WhatsApp coexist run parked waiting for
                // more Meta history must be torn down with its integration.
                // The list comes from the repository constant so it can never
                // drift from the one the flush and recovery passes use.
                inArray(coexistSyncRunModel.status, LIVE_RUN_STATUSES),
              ),
            )
          await tx
            .delete(whatsappCoexistStagingModel)
            .where(
              eq(
                whatsappCoexistStagingModel.phoneNumberId,
                inbox.integrationWhatsapp.phoneNumberId,
              ),
            )
          await tx
            .delete(integrationWhatsappModel)
            .where(
              eq(integrationWhatsappModel.id, inbox.integrationWhatsapp.id),
            )
        }
        await finish(integrations?.whatsapp)
        return
      }
      case channelTypes.enum.zalo: {
        if (removeIntegrationRow && inbox.integrationZalo) {
          await tx
            .delete(tagChannelModel)
            .where(
              and(
                eq(tagChannelModel.channelType, channelTypes.enum.zalo),
                eq(tagChannelModel.integrationId, inbox.integrationZalo.id),
              ),
            )
          await tx
            .delete(integrationZaloModel)
            .where(eq(integrationZaloModel.id, inbox.integrationZalo.id))
        }
        await finish(integrations?.zalo)
        return
      }
      case channelTypes.enum.telegram: {
        if (removeIntegrationRow && inbox.integrationTelegram) {
          await tx
            .delete(integrationTelegramModel)
            .where(
              eq(integrationTelegramModel.id, inbox.integrationTelegram.id),
            )
        }
        await finish(integrations?.telegram)
        return
      }
      case channelTypes.enum.instagram: {
        if (removeIntegrationRow && inbox.integrationInstagram) {
          if (inbox.integrationInstagram.type === "instagram") {
            await coexistService.tearDownForIntegration({
              workspaceId: inbox.workspaceId,
              integrationId: inbox.integrationInstagram.id,
              channel: "instagram",
              currentError: "Integration disconnected",
              tx,
            })
          }
          await tx
            .delete(integrationInstagramModel)
            .where(
              eq(integrationInstagramModel.id, inbox.integrationInstagram.id),
            )
        }
        await finish(
          integrations?.[
            inbox.integrationInstagram?.type === "facebook"
              ? "instagramFacebook"
              : "instagram"
          ],
        )
        return
      }
      case channelTypes.enum.tiktok: {
        if (removeIntegrationRow && inbox.integrationTiktok) {
          await tx
            .delete(integrationTiktokModel)
            .where(eq(integrationTiktokModel.id, inbox.integrationTiktok.id))
        }
        await finish(integrations?.tiktok)
        return
      }
      case channelTypes.enum.threads: {
        if (removeIntegrationRow && inbox.integrationThreads) {
          await tx
            .delete(integrationThreadsModel)
            .where(eq(integrationThreadsModel.id, inbox.integrationThreads.id))
        }
        await finish(integrations?.threads)
        return
      }
      case channelTypes.enum.webchat: {
        if (removeIntegrationRow && inbox.integrationWebchat) {
          await tx
            .delete(integrationWebchatModel)
            .where(eq(integrationWebchatModel.id, inbox.integrationWebchat.id))
        }
        await finish(integrations?.webchat)
        return
      }
      case channelTypes.enum.smtp: {
        if (removeIntegrationRow && inbox.integrationSmtp) {
          await tx
            .delete(integrationSmtpModel)
            .where(eq(integrationSmtpModel.id, inbox.integrationSmtp.id))
        }
        await finish(integrations?.smtp)
        return
      }
      default:
        await finish()
    }
  }
}

const inboxToAuth = (inbox: InboxWithIntegrations): unknown => {
  switch (inbox.channel) {
    case channelTypes.enum.messenger:
      return inbox.integrationMessenger?.auth
    case channelTypes.enum.whatsapp:
      return inbox.integrationWhatsapp?.auth
    case channelTypes.enum.zalo:
      return inbox.integrationZalo?.auth
    case channelTypes.enum.telegram:
      return inbox.integrationTelegram?.auth
    case channelTypes.enum.tiktok:
      return inbox.integrationTiktok?.auth
    case channelTypes.enum.webchat:
      return inbox.integrationWebchat?.auth
    case channelTypes.enum.smtp:
      return inbox.integrationSmtp?.auth
    case channelTypes.enum.instagram:
      return inbox.integrationInstagram?.auth
    case channelTypes.enum.threads:
      return inbox.integrationThreads?.auth
    default:
      return null
  }
}

export const workspaceLifecycleService = new WorkspaceLifecycleService()
