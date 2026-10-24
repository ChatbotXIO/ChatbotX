import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import {
  channelTypes,
  type InboxDisconnectReason,
} from "@chatbotx.io/database/partials"
import {
  connectionRepository,
  HEAVY_WORKSPACE_TABLES,
  LIVE_RUN_STATUSES,
  NO_FK_WORKSPACE_TABLES,
  PARTITIONED_WORKSPACE_TABLES,
  PULL_CLAIMABLE_STATUSES,
  WORKSPACE_ANALYTICS_HYPERTABLES,
  workspacePurgeRepository,
} from "@chatbotx.io/database/repositories"
import {
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
  completeActiveSequenceEnrollmentBatch,
  SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE,
} from "./campaign-cleanup"
import {
  assertPurgeDeadline,
  drainInBatches,
  isPurgeTimeoutError,
  pause,
  withPurgeTimeouts,
} from "./purge-batch"
import { cancelSmartDelaysForWorkspace } from "./smart-delay-cleanup"

type WorkspaceTeardownIntegration = {
  disconnect(auth: unknown): Promise<void>
  isRevokedTokenError?: (error: unknown) => boolean
}

type DisconnectService = {
  disconnect(workspaceId: string): Promise<void>
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
const ANALYTICS_HYPERTABLE_MAX_SLICES = 1000
const ANALYTICS_SLICE_MS = 24 * 60 * 60 * 1000
const MIN_ANALYTICS_SLICE_MS = 60 * 1000

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
    deadlineAt: number,
  ): Promise<void> {
    await withPurgeTimeouts({
      fn: async (tx) =>
        await cancelInFlightBroadcastsForWorkspace({ tx, workspaceId }),
      table: "Broadcast",
      workspaceId,
    })

    const completedEnrollments = await drainInBatches({
      batchSize: SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE,
      deadlineAt,
      maxBatches: 400,
      runBatch: async (tx) => {
        const count = await completeActiveSequenceEnrollmentBatch({
          tx,
          workspaceId,
        })
        return { count, value: undefined }
      },
      table: "ContactOnSequence",
      workspaceId,
    })
    logger.info(
      { completedEnrollments, workspaceId },
      "workspace-freeze: completed sequence enrollments",
    )

    const canceledDispatches = await drainInBatches({
      afterBatch: async (
        dispatches: Awaited<ReturnType<typeof cancelPendingDispatchBatch>>,
      ) => {
        await removeDispatchesFromSchedule(dispatches).catch((err) => {
          logger.warn(
            { err, workspaceId },
            "workspace-freeze: failed to remove sequence dispatches from schedule",
          )
        })
      },
      batchSize: WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE,
      deadlineAt,
      maxBatches: 400,
      runBatch: async (tx) => {
        const dispatches = await cancelPendingDispatchBatch({
          client: tx,
          workspaceId,
        })
        return { count: dispatches.length, value: dispatches }
      },
      table: "SequenceDispatch",
      workspaceId,
    })
    logger.info(
      { canceledDispatches, workspaceId },
      "workspace-freeze: canceled sequence dispatches",
    )

    const canceledSmartDelays = await cancelSmartDelaysForWorkspace({
      deadlineAt,
      workspaceId,
    })
    logger.info(
      { canceledSmartDelays, workspaceId },
      "workspace-freeze: canceled smart delays",
    )
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
    deadlineAt: number
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

    for (const spec of PARTITIONED_WORKSPACE_TABLES) {
      totalDeleted += await drainInBatches({
        afterBatch: async () => await pause(INTER_CHUNK_DELAY_MS),
        batchSize: defaultBatchSize,
        deadlineAt: props.deadlineAt,
        maxBatches: HEAVY_PURGE_MAX_BATCHES_PER_TABLE,
        runBatch: async (tx) => ({
          count: await workspacePurgeRepository.deletePartitionedBatch(
            spec,
            props.workspaceId,
            defaultBatchSize,
            tx,
          ),
          value: undefined,
        }),
        table: spec.table,
        workspaceId: props.workspaceId,
      })
      if (
        await workspacePurgeRepository.hasPartitionedWorkspaceRows(
          spec,
          props.workspaceId,
        )
      ) {
        throw new WorkspacePurgeIncompleteError(props.workspaceId, spec.table)
      }
    }

    totalDeleted += await purgeLeaderboardDataForWorkspace(props.workspaceId, {
      batchSize: defaultBatchSize,
      deadlineAt: props.deadlineAt,
    })

    for (const table of HEAVY_WORKSPACE_TABLES) {
      const batchSize = HEAVY_PURGE_BATCH_SIZES[table] ?? defaultBatchSize
      totalDeleted += await drainInBatches({
        afterBatch: async () => await pause(INTER_CHUNK_DELAY_MS),
        batchSize,
        deadlineAt: props.deadlineAt,
        maxBatches: HEAVY_PURGE_MAX_BATCHES_PER_TABLE,
        runBatch: async (tx) => ({
          count: await workspacePurgeRepository.deleteWorkspaceRowsBatch(
            table,
            props.workspaceId,
            batchSize,
            tx,
          ),
          value: undefined,
        }),
        table,
        workspaceId: props.workspaceId,
      })
      if (
        await workspacePurgeRepository.hasWorkspaceRows(
          table,
          props.workspaceId,
        )
      ) {
        throw new WorkspacePurgeIncompleteError(props.workspaceId, table)
      }
    }

    for (const entry of NO_FK_WORKSPACE_TABLES) {
      if (entry.stage !== "ctid") {
        continue
      }
      const { table } = entry
      totalDeleted += await drainInBatches({
        afterBatch: async () => await pause(INTER_CHUNK_DELAY_MS),
        batchSize: defaultBatchSize,
        deadlineAt: props.deadlineAt,
        maxBatches: HEAVY_PURGE_MAX_BATCHES_PER_TABLE,
        runBatch: async (tx) => ({
          count: await workspacePurgeRepository.deleteWorkspaceRowsBatch(
            table,
            props.workspaceId,
            defaultBatchSize,
            tx,
          ),
          value: undefined,
        }),
        table,
        workspaceId: props.workspaceId,
      })
      if (
        await workspacePurgeRepository.hasWorkspaceRows(
          table,
          props.workspaceId,
        )
      ) {
        throw new WorkspacePurgeIncompleteError(props.workspaceId, table)
      }
    }

    return totalDeleted
  }

  private async deleteWorkspaceAnalyticsRows(
    workspaceId: string,
    deadlineAt: number,
  ): Promise<number> {
    let deleted = 0
    for (const table of WORKSPACE_ANALYTICS_HYPERTABLES) {
      let sliceMs = ANALYTICS_SLICE_MS
      for (let batch = 0; batch < ANALYTICS_HYPERTABLE_MAX_SLICES; batch += 1) {
        assertPurgeDeadline(deadlineAt, workspaceId, table)
        const from = await workspacePurgeRepository.findNextAnalyticsRowAt(
          table,
          workspaceId,
        )
        if (!from) {
          break
        }
        const to = new Date(from.getTime() + sliceMs)
        try {
          deleted += await withPurgeTimeouts({
            fn: async (tx) =>
              await workspacePurgeRepository.deleteAnalyticsSlice(
                table,
                workspaceId,
                from,
                to,
                tx,
              ),
            rethrowTimeout: true,
            table,
            workspaceId,
          })
          sliceMs = ANALYTICS_SLICE_MS
        } catch (err) {
          if (isPurgeTimeoutError(err) && sliceMs > MIN_ANALYTICS_SLICE_MS) {
            sliceMs = Math.max(MIN_ANALYTICS_SLICE_MS, Math.floor(sliceMs / 2))
            continue
          }
          if (isPurgeTimeoutError(err)) {
            throw new WorkspacePurgeIncompleteError(workspaceId, table)
          }
          throw err
        }
      }
      if (await workspacePurgeRepository.hasWorkspaceRows(table, workspaceId)) {
        throw new WorkspacePurgeIncompleteError(workspaceId, table)
      }
    }
    return deleted
  }

  private async deleteWorkspaceHypertableRows(
    workspaceId: string,
    deadlineAt: number,
  ): Promise<number> {
    let deleted = 0
    for (const table of ["Message", "Attachment"] as const) {
      let deletedFromTable = 0
      await drainInBatches({
        afterBatch: async (count: number) => {
          deletedFromTable += count
          await pause(INTER_CHUNK_DELAY_MS)
        },
        batchSize: HYPERTABLE_CONVERSATION_BATCH_SIZE,
        deadlineAt,
        maxBatches: HYPERTABLE_MAX_CONVERSATION_BATCHES,
        runBatch: async (tx) => {
          const conversationIds =
            await workspacePurgeRepository.listMessageConversationPage(
              table,
              workspaceId,
              HYPERTABLE_CONVERSATION_BATCH_SIZE,
              tx,
            )
          const count =
            conversationIds.length === 0
              ? 0
              : await workspacePurgeRepository.deleteMessagesAndAttachments(
                  workspaceId,
                  conversationIds,
                  tx,
                )
          return { count: conversationIds.length, value: count }
        },
        table,
        workspaceId,
      })
      deleted += deletedFromTable
      if (await workspacePurgeRepository.hasWorkspaceRows(table, workspaceId)) {
        throw new WorkspacePurgeIncompleteError(workspaceId, table)
      }
    }
    return deleted
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
