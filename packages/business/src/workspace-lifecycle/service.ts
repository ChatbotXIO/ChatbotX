import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  liftDecompressionLimit,
  sql,
} from "@chatbotx.io/database/client"
import { channelTypes, ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  attachmentModel,
  coexistSyncRunModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationSmtpModel,
  integrationTelegramModel,
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
  cancelPendingDispatchesForWorkspace,
  removeDispatchesFromSchedule,
} from "@chatbotx.io/sequence-scheduler/dispatch-cancel"
import { BaseService } from "../base.service"
import { coexistService } from "../coexist/service"
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
import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"
import {
  cancelInFlightBroadcastsForWorkspace,
  completeActiveSequenceEnrollmentsForWorkspace,
} from "./campaign-cleanup"
import { cancelSmartDelaysForWorkspace } from "./smart-delay-cleanup"

type WorkspaceTeardownIntegration = {
  disconnect(auth: unknown): Promise<void>
  isRevokedTokenError?: (error: unknown) => boolean
}

type DisconnectService = {
  disconnect(workspaceId: string): Promise<void>
}

type DispatchToRemove = {
  bucket: number
  id: string
}

export type WorkspaceTeardownIntegrations = Record<
  string,
  WorkspaceTeardownIntegration | undefined
>

export type WorkspaceTeardownLevel = "pause" | "disconnect"

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
  "AIConversationEmbedding",
  "AIEmbedding",
  "Conversation",
  "TriggerExecution",
  "FlowRun",
  "Contact",
] as const

const HEAVY_PURGE_BATCH_SIZE = 5000
const INTER_CHUNK_DELAY_MS = 100
// Conversation ids deleted per hypertable transaction. Deliberately small:
// deleting a compressed chunk decompresses its rows first, so each batch's
// decompression footprint (DB backend memory + WAL) is bounded to ~10
// conversations' worth of >30-day history — keeping the spike well clear of a
// high-ingest system running alongside the purge.
const HYPERTABLE_CONVERSATION_BATCH_SIZE = 10
// Backstop so a single workspace with a runaway row count cannot spin forever;
// 5000 * 2000 = 10M rows per table per purge run. Anything beyond that drains
// on the next scheduled tick.
const HEAVY_PURGE_MAX_BATCHES_PER_TABLE = 2000
// Backstop for the per-conversation hypertable passes. Bounds one workspace's
// drain per run (~10k conversations per pass) so a single very large workspace
// cannot hold the purge distributed lock for a large fraction of the cron
// interval; the residue drains on the next scheduled tick.
const HYPERTABLE_MAX_CONVERSATION_BATCHES = 1000

class WorkspaceLifecycleService extends BaseService {
  async disconnectWorkspaceChannels(props: {
    workspaceId: string
    ownerId: string
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
    tx?: DatabaseClient
  }): Promise<number> {
    const { tx = db } = props
    const inboxes = await inboxService.listWithIntegrationsByWorkspace(
      props.workspaceId,
      tx,
    )

    let disconnected = 0
    for (const inbox of inboxes) {
      await this.disconnectWorkspaceInbox({
        inbox,
        ownerId: props.ownerId,
        integrations: props.integrations,
        teardownLevel: props.teardownLevel ?? "disconnect",
        tx,
      })
      disconnected += 1
    }

    return disconnected
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
   * Called when deletion is scheduled and when the owner's entitlement is torn
   * down. The runtime guards (`withBlockedOwnerGuard`) would no-op these jobs
   * anyway, but they would keep waking for the whole grace window — and the
   * smart-delay scanner would churn them through claim → drop → reset every
   * tick. Cancelling the rows is what makes the freeze quiet as well as safe.
   *
   * Each source is independent and best-effort: a Redis failure on one must not
   * leave the others armed.
   */
  async freezeWorkspaceRuntime(workspaceId: string): Promise<void> {
    const dispatchesToRemove: DispatchToRemove[] = await db.transaction(
      async (tx) => {
        await cancelInFlightBroadcastsForWorkspace({
          tx,
          workspaceId,
        })

        await completeActiveSequenceEnrollmentsForWorkspace({
          tx,
          workspaceId,
        })

        return await cancelPendingDispatchesForWorkspace({
          client: tx,
          removeFromSchedule: false,
          workspaceId,
        })
      },
    )

    try {
      await removeDispatchesFromSchedule(dispatchesToRemove)
    } catch (err) {
      logger.warn(
        { err, dispatchCount: dispatchesToRemove.length, workspaceId },
        "workspace-teardown: failed to remove dispatches from schedule",
      )
    }

    try {
      const canceledSmartDelays = await cancelSmartDelaysForWorkspace({
        workspaceId,
      })
      logger.info(
        { canceledSmartDelays, workspaceId },
        "workspace-freeze: canceled smart delays",
      )
    } catch (err) {
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
    workspaceId: string
    batchSize?: number
  }): Promise<number> {
    const batchSize = props.batchSize ?? HEAVY_PURGE_BATCH_SIZE
    let totalDeleted = 0

    // Drain the compressed hypertables (Message/Attachment) first, by
    // conversationId, before the ctid loop deletes their parent Conversation
    // rows. Uses the decompression-cap-lifted delete, not `ctid`.
    totalDeleted += await this.deleteWorkspaceHypertableRows(props.workspaceId)

    for (const table of HEAVY_WORKSPACE_TABLES) {
      for (let batch = 0; batch < HEAVY_PURGE_MAX_BATCHES_PER_TABLE; batch++) {
        const deleted = await this.deleteHeavyBatch(
          table,
          props.workspaceId,
          batchSize,
        )
        totalDeleted += deleted
        if (deleted < batchSize) {
          break
        }

        await new Promise((resolve) =>
          setTimeout(resolve, INTER_CHUNK_DELAY_MS),
        )
      }
    }

    return totalDeleted
  }

  private async deleteHeavyBatch(
    table: (typeof HEAVY_WORKSPACE_TABLES)[number],
    workspaceId: string,
    batchSize: number,
  ): Promise<number> {
    // `ctid` self-join keeps the delete bounded to `batchSize` physical rows —
    // Postgres has no `DELETE ... LIMIT`. The table name is a compile-time
    // constant from HEAVY_WORKSPACE_TABLES, never caller input, so this raw
    // identifier interpolation is not an injection surface.
    const result = await db.execute(sql`
      DELETE FROM ${sql.raw(`"${table}"`)}
      WHERE "ctid" IN (
        SELECT "ctid" FROM ${sql.raw(`"${table}"`)}
        WHERE "workspaceId" = ${workspaceId}
        LIMIT ${batchSize}
      )
    `)
    return result.rowCount ?? 0
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
  ): Promise<number> {
    const deletePage = (conversationIds: string[]) =>
      db.transaction(async (tx) => {
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
        return (messageResult.rowCount ?? 0) + (attachmentResult.rowCount ?? 0)
      })

    let deleted = 0

    // Pass 1: discovery driven off Message (the high-volume table). Each deleted
    // page removes those conversationIds, so re-querying with the same LIMIT
    // walks forward until none remain. The batch cap bounds a single run; any
    // residue drains on the next scheduled tick.
    for (let batch = 0; batch < HYPERTABLE_MAX_CONVERSATION_BATCHES; batch++) {
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
      await new Promise((resolve) => setTimeout(resolve, INTER_CHUNK_DELAY_MS))
    }

    // Pass 2: attachment-only conversations (attachments whose Message rows were
    // already gone) that pass 1 never enumerated.
    for (let batch = 0; batch < HYPERTABLE_MAX_CONVERSATION_BATCHES; batch++) {
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
      await new Promise((resolve) => setTimeout(resolve, INTER_CHUNK_DELAY_MS))
    }

    return deleted
  }

  async deactivateOwnerWorkspaces(props: {
    ownerId: string
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel?: WorkspaceTeardownLevel
  }): Promise<void> {
    const workspaces = await db.query.workspaceModel.findMany({
      where: { ownerId: props.ownerId },
      columns: { id: true, tenantId: true },
    })

    if (workspaces.length === 0) {
      return
    }

    const teardownLevel = props.teardownLevel ?? "pause"
    for (const workspace of workspaces) {
      await this.disconnectWorkspaceChannels({
        integrations: props.integrations,
        teardownLevel,
        workspaceId: workspace.id,
        ownerId: props.ownerId,
      })
      if (teardownLevel === "disconnect") {
        await this.disconnectWorkspaceIntegrations(workspace.id)
      }
    }

    await userQuotaService.reconcileOwnerPoolUsage(
      props.ownerId,
      workspaces[0]?.tenantId ?? ROOT_TENANT_ID,
    )
  }

  private async disconnectWorkspaceInbox(props: {
    inbox: InboxWithIntegrations
    ownerId: string
    integrations?: WorkspaceTeardownIntegrations
    teardownLevel: WorkspaceTeardownLevel
    tx: DatabaseClient
  }): Promise<void> {
    const { inbox, ownerId, integrations, teardownLevel, tx } = props
    const removeIntegrationRow = teardownLevel === "disconnect"

    const finish = async (disconnect?: WorkspaceTeardownIntegration) => {
      const auth = inboxToAuth(inbox)
      // Skip the provider call when the integration/auth row is already gone:
      // there are no credentials to disconnect with, and passing an undefined
      // auth crashes providers that read it (e.g. messenger/whatsapp reach into
      // `auth.metadata`). Removing the inbox row below is still done.
      if (disconnect && auth) {
        try {
          await disconnect.disconnect(auth)
        } catch (err) {
          if (!disconnect.isRevokedTokenError?.(err)) {
            logger.error(
              { err, inboxId: inbox.id, workspaceId: inbox.workspaceId },
              "workspace-teardown: provider disconnect failed",
            )
          }
        }
      }

      // Delegates to inboxService (already a dependency here) rather than
      // calling quotaEnforcementService/workspaceUsageService directly: those
      // import back through tenant/workspace services and would close a
      // circular dependency with this module.
      await inboxService.disconnect({
        inboxId: inbox.id,
        ownerId,
        workspaceId: inbox.workspaceId,
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
                inArray(coexistSyncRunModel.status, ["init", "running"]),
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
                inArray(coexistSyncRunModel.status, ["init", "running"]),
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
    default:
      return null
  }
}

export const workspaceLifecycleService = new WorkspaceLifecycleService()
