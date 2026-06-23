import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  coexistSyncRunModel,
  contactInboxModel,
  conversationModel,
  inboxModel,
} from "@chatbotx.io/database/schema"
import {
  listConversations,
  type MessengerConversation,
} from "@chatbotx.io/integration-messenger/apis/sync"
import {
  type BucUsage,
  concurrencyForUsage,
} from "@chatbotx.io/integration-messenger/apis/usage"
import type { IncomingContact } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobCoexistMessengerSync,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import pLimit from "p-limit"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  applyCoexistActivityUpdates,
  bulkImportContacts,
  bulkImportMessages,
  type CoexistActivityUpdate,
  type ContactImportLink,
  createHistoricalIdFactory,
} from "./bulk-historical-import"
import {
  fetchConvMessages,
  STORE_WINDOW_MS,
  splitName,
  withInlineRetry,
} from "./messenger-helpers"

const messengerAuthSchema = z
  .object({
    tokens: z.object({ accessToken: z.string() }).passthrough(),
    metadata: z
      .object({ version: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** Default Graph concurrency when BUC usage signals "plenty of budget". */
const DEFAULT_CONCURRENCY = 5

/**
 * Active wall-time budget per chunk. When exceeded, the job persists state and
 * either hot-chains a continuation enqueue or yields to the scheduler.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/**
 * Resolves the per-integration resume ceiling from the most recent prior
 * `CoexistSyncRun` row. See bulk-historical-import for full semantics.
 */
async function fetchPriorRunCeiling(
  integrationId: string,
  currentRunId: string,
): Promise<Date | null> {
  const priorRun = await db.query.coexistSyncRunModel.findFirst({
    where: {
      integrationId,
      channel: "messenger",
      status: { in: ["succeeded", "partial"] },
      id: { ne: currentRunId },
    },
    orderBy: { startedAt: "desc" },
    columns: { startedAt: true, lastSyncedAt: true, status: true },
  })
  if (!priorRun) {
    return null
  }
  if (priorRun.status === "succeeded") {
    return priorRun.startedAt ?? null
  }
  return priorRun.lastSyncedAt ?? priorRun.startedAt ?? null
}

type ConvFilter = {
  convsToProcess: MessengerConversation[]
  stopAll: boolean
  oldestConvProcessed: Date | null
}

/**
 * Apply within-run frontier + cross-run ceiling filters to one Graph
 * conversations page. Shared by both phases since each phase walks
 * `/conversations` DESC and tracks its own `lastSyncedAt` watermark.
 */
function filterConversations(
  conversations: MessengerConversation[],
  frontier: Date | null,
  ceiling: Date | null,
  currentOldest: Date | null,
): ConvFilter {
  let stopAll = false
  let oldestConvProcessed = currentOldest
  const convsToProcess: MessengerConversation[] = []

  for (const conv of conversations) {
    const convTime = conv.updated_time ? new Date(conv.updated_time) : null

    // No timestamp = can't position vs frontier/ceiling and can't update
    // watermark. Skip — Graph rarely returns this, and importing without
    // ordering risks re-import on every run (M1).
    if (!convTime) {
      continue
    }

    if (ceiling && convTime <= ceiling) {
      stopAll = true
      break
    }

    if (frontier && convTime > frontier) {
      continue
    }

    convsToProcess.push(conv)

    if (oldestConvProcessed === null || convTime < oldestConvProcessed) {
      oldestConvProcessed = convTime
    }
  }

  return { convsToProcess, stopAll, oldestConvProcessed }
}

const participantSourceId = (
  conv: MessengerConversation,
  pageId: string,
): { sourceId: string; name?: string } | null => {
  const participant = conv.participants?.data?.find(
    (entry) => entry.id !== pageId,
  )
  if (!participant) {
    return null
  }
  return { sourceId: participant.id, name: participant.name }
}

type SyncContext = {
  runId: string
  integrationId: string
  workspaceId: string
  pageId: string
  accessToken: string
  version: string | undefined
  inbox: Awaited<ReturnType<typeof findOrFail<typeof inboxModel>>>
  defaultCountry: string | null
  ceiling: Date | null
  applyBucThrottle: (usage: BucUsage | null | undefined) => void
  respectPause: () => Promise<void>
  getLimit: () => ReturnType<typeof pLimit>
  jobStart: number
  /** Mutated by handlers to surface non-fatal failures into currentError. */
  errorRef: { current: string | undefined }
}

type PhaseResult = {
  /** True when the phase has no more pages to process. */
  done: boolean
  /** Last per-page oldest conv-time, persisted to lastSyncedAt. */
  oldestConvProcessed: Date | null
  pageNumber: number
}

type ListConversationsPage = Awaited<ReturnType<typeof listConversations>>

type PageHandler = (args: {
  conversations: ListConversationsPage
  filtered: ConvFilter
  pageNumber: number
  currentOldest: Date | null
}) => Promise<Date | null>

/**
 * Walk `/me/conversations` DESC pages until cursor exhausts, ceiling stops
 * the walk, or the chunk budget expires. Handles inline retry, BUC throttle,
 * heartbeat, pause, and the frontier/ceiling filter on each page. The phase's
 * `onPage` callback runs per-page side effects (DB writes, sub-fetches) and
 * returns the new oldest-processed watermark to persist as `lastSyncedAt`.
 */
async function walkConversationsPages(
  ctx: SyncContext,
  phaseName: "contacts" | "messages",
  frontier: Date | null,
  onPage: PageHandler,
): Promise<PhaseResult> {
  const { runId, pageId, jobStart } = ctx
  let oldestConvProcessed: Date | null = frontier
  let pageCursor: string | undefined
  let pageNumber = 0

  while (true) {
    if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
      return { done: false, oldestConvProcessed, pageNumber }
    }

    await ctx.respectPause()
    pageNumber += 1

    const conversations = await withInlineRetry(() =>
      listConversations({
        pageId,
        accessToken: ctx.accessToken,
        version: ctx.version,
        after: pageCursor,
      }),
    )
    ctx.applyBucThrottle(conversations.bucUsage)
    // Honour any BUC-imposed pause immediately — including when this is the
    // final page and the loop will exit without a subsequent respectPause().
    await ctx.respectPause()

    await db
      .update(coexistSyncRunModel)
      .set({
        currentStep: `phase=${phaseName} page ${pageNumber} — ${conversations.data.length} conversations`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coexistSyncRunModel.id, runId))

    const filtered = filterConversations(
      conversations.data,
      frontier,
      ctx.ceiling,
      oldestConvProcessed,
    )

    oldestConvProcessed = await onPage({
      conversations,
      filtered,
      pageNumber,
      currentOldest: oldestConvProcessed,
    })

    pageCursor = conversations.after

    if (!pageCursor || filtered.stopAll) {
      return { done: true, oldestConvProcessed, pageNumber }
    }
  }
}

/**
 * Phase 1 — walk `/me/conversations` DESC, dedup participants, bulk upsert
 * Contacts, dispatch avatar fetch jobs. Messages are NOT fetched here.
 */
async function runContactsPhase(ctx: SyncContext): Promise<PhaseResult> {
  const { runId, workspaceId, pageId, inbox } = ctx

  const [runRow] = await db
    .select({ lastSyncedAt: coexistSyncRunModel.lastSyncedAt })
    .from(coexistSyncRunModel)
    .where(eq(coexistSyncRunModel.id, runId))
    .limit(1)

  if (!runRow) {
    return { done: true, oldestConvProcessed: null, pageNumber: 0 }
  }

  return walkConversationsPages(
    ctx,
    "contacts",
    runRow.lastSyncedAt,
    async ({ filtered, pageNumber }) => {
      const contactBatch: IncomingContact[] = []
      for (const conv of filtered.convsToProcess) {
        const participant = participantSourceId(conv, pageId)
        if (!participant) {
          continue
        }
        const { firstName, lastName } = splitName(participant.name)
        contactBatch.push({
          sourceId: participant.sourceId,
          firstName,
          lastName,
        })
      }

      let pageResult: Awaited<ReturnType<typeof bulkImportContacts>>
      try {
        pageResult = await bulkImportContacts({
          inbox,
          workspaceId,
          contacts: contactBatch,
        })
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Unknown bulk import error"
        logger.error(
          { error, runId, pageNumber },
          "[coexist] Messenger contact bulk import threw — page lost",
        )
        pageResult = {
          importedContacts: 0,
          skippedContacts: 0,
          contactInboxIds: new Map(),
        }
        ctx.errorRef.current = `phase=contacts page ${pageNumber} bulk import failed: ${errMsg}`
      }

      // Bulk-enqueue one avatar-mirror job per resolved contact.
      if (pageResult.contactInboxIds.size > 0) {
        const avatarJobs = Array.from(
          pageResult.contactInboxIds,
          ([sourceId, link]) => ({
            name: IntegrationJobAction.updateContactAvatar,
            data: {
              type: IntegrationJobAction.updateContactAvatar,
              data: {
                workspaceId,
                contactInboxId: link.contactInboxId,
                sourceId,
              },
            },
            opts: {
              jobId: `update-avatar-${link.contactInboxId}`,
              attempts: 2,
              removeOnComplete: true,
              removeOnFail: { count: 100 },
            },
          }),
        )
        try {
          await integrationQueue.addBulk(avatarJobs)
        } catch (error) {
          logger.error(
            { error, runId, pageNumber, jobCount: avatarJobs.length },
            "[coexist] avatar addBulk failed — continuing run",
          )
        }
      }

      if (pageResult.failureReason) {
        ctx.errorRef.current = `phase=contacts page ${pageNumber}: ${pageResult.failureReason}`
      }

      await db
        .update(coexistSyncRunModel)
        .set({
          currentScan: sql`${coexistSyncRunModel.currentScan} + ${filtered.convsToProcess.length}`,
          importedContactCount: sql`${coexistSyncRunModel.importedContactCount} + ${pageResult.importedContacts}`,
          skippedCount: sql`${coexistSyncRunModel.skippedCount} + ${pageResult.skippedContacts}`,
          lastSyncedAt: filtered.oldestConvProcessed,
          currentStep: `phase=contacts page ${pageNumber} processed`,
          currentError: ctx.errorRef.current ?? null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      return filtered.oldestConvProcessed
    },
  )
}

/**
 * Phase 2 — re-walk `/me/conversations` DESC and, per conversation, fetch its
 * messages via Graph, run phone/email discovery, then `bulkImportMessages`
 * with the resolved Contact/ContactInbox/Conversation triple. Frontier resets
 * to NULL on transition so this walk starts from newest.
 */
async function runMessagesPhase(ctx: SyncContext): Promise<PhaseResult> {
  const { runId, workspaceId, pageId, inbox } = ctx

  const [runRow] = await db
    .select({ lastSyncedAt: coexistSyncRunModel.lastSyncedAt })
    .from(coexistSyncRunModel)
    .where(eq(coexistSyncRunModel.id, runId))
    .limit(1)

  if (!runRow) {
    return { done: true, oldestConvProcessed: null, pageNumber: 0 }
  }

  const fallbackCutoff = new Date(Date.now() - STORE_WINDOW_MS)
  // ONE factory shared across all per-conv bulkImportMessages calls in this
  // chunk — its per-import used-set probes same-ms IDs that collide across convs
  // (H1). IDs are derived from (createdAt, sourceId), independent of runId.
  const idFactory = createHistoricalIdFactory()

  return walkConversationsPages(
    ctx,
    "messages",
    runRow.lastSyncedAt,
    async ({ filtered, pageNumber, currentOldest }) => {
      // Single pass: extract participant per conversation.
      const convsByParticipant = new Map<string, MessengerConversation>()
      for (const conv of filtered.convsToProcess) {
        const p = participantSourceId(conv, pageId)
        if (!p) {
          continue
        }
        convsByParticipant.set(p.sourceId, conv)
      }
      const sourceIds = Array.from(convsByParticipant.keys())

      // Single JOIN resolves ContactInbox + Conversation in one round trip.
      const linkBySource = new Map<string, ContactImportLink>()
      if (sourceIds.length > 0) {
        const rows = await db
          .select({
            sourceId: contactInboxModel.sourceId,
            contactInboxId: contactInboxModel.id,
            contactId: contactInboxModel.contactId,
            conversationId: conversationModel.id,
          })
          .from(contactInboxModel)
          .leftJoin(
            conversationModel,
            eq(conversationModel.contactId, contactInboxModel.contactId),
          )
          .where(
            and(
              eq(contactInboxModel.inboxId, inbox.id),
              inArray(contactInboxModel.sourceId, sourceIds),
            ),
          )
        for (const r of rows) {
          if (!r.conversationId) {
            continue
          }
          linkBySource.set(r.sourceId, {
            contactInboxId: r.contactInboxId,
            contactId: r.contactId,
            conversationId: r.conversationId,
          })
        }
      }

      let pageImported = 0
      let pageSkipped = 0
      let pageFailed = 0
      let pageOldest: Date | null = currentOldest
      const pageAttachmentIds: string[] = []
      // Collected across all convs in this chunk, then flushed once per table
      // after the barrier — keeps the activity bumps out of the per-page loop.
      const activityUpdates: CoexistActivityUpdate[] = []

      const limit = ctx.getLimit()
      await Promise.all(
        Array.from(convsByParticipant, ([sourceId, conv]) =>
          limit(async () => {
            const link = linkBySource.get(sourceId)
            if (!link) {
              // Contact rejected in phase 1 — no target to write to. Skip.
              return
            }

            const convTime = conv.updated_time
              ? new Date(conv.updated_time)
              : null
            const cutoff = convTime
              ? new Date(convTime.getTime() - STORE_WINDOW_MS)
              : fallbackCutoff

            // Newest message time across this conv's pages — one activity bump
            // per conv (not per page).
            let convNewest: Date | null = null
            let convNewestIncoming: Date | null = null

            try {
              await fetchConvMessages({
                conversationId: conv.id,
                accessToken: ctx.accessToken,
                version: ctx.version,
                cutoff,
                ceiling: ctx.ceiling,
                pageId,
                defaultCountry: ctx.defaultCountry,
                applyBucThrottle: ctx.applyBucThrottle,
                respectPause: ctx.respectPause,
                // M3: flush each Graph page immediately — `pageDiscovered` is
                // the live enrichment object so all data found so far is passed.
                onPage: async (pageMessages, pageDiscovered) => {
                  const result = await bulkImportMessages({
                    workspaceId,
                    runId,
                    contactInboxId: link.contactInboxId,
                    contactId: link.contactId,
                    conversationId: link.conversationId,
                    messages: pageMessages,
                    contactEnrichment: pageDiscovered,
                    idFactory,
                  })
                  pageImported += result.importedMessages
                  pageSkipped += result.skippedMessages
                  for (const id of result.insertedAttachmentIds) {
                    pageAttachmentIds.push(id)
                  }
                  if (
                    result.newestMessageAt &&
                    (!convNewest || convNewest < result.newestMessageAt)
                  ) {
                    convNewest = result.newestMessageAt
                  }
                  if (
                    result.newestIncomingMessageAt &&
                    (!convNewestIncoming ||
                      convNewestIncoming < result.newestIncomingMessageAt)
                  ) {
                    convNewestIncoming = result.newestIncomingMessageAt
                  }
                },
              })

              if (convNewest) {
                activityUpdates.push({
                  contactInboxId: link.contactInboxId,
                  conversationId: link.conversationId,
                  newestMessageAt: convNewest,
                  newestIncomingMessageAt: convNewestIncoming,
                })
              }

              if (convTime && (pageOldest === null || convTime < pageOldest)) {
                pageOldest = convTime
              }
            } catch (error) {
              const errMsg =
                error instanceof Error
                  ? error.message
                  : "Unknown message fetch error"
              logger.error(
                { error, conversationId: conv.id, runId },
                "[coexist] Messenger phase=messages conv failed",
              )
              ctx.errorRef.current = `conv ${conv.id} message fetch failed: ${errMsg}`
              pageFailed += 1
            }
          }),
        ),
      )

      // One UPDATE per table for the whole chunk (not per conv/page in the loop).
      await applyCoexistActivityUpdates(activityUpdates)

      // Bulk-enqueue per-attachment download jobs. The handler is idempotent
      // (prefix-checked + jobId-dedup'd), so a retry of this whole chunk
      // re-enqueues the same jobIds harmlessly.
      if (pageAttachmentIds.length > 0) {
        try {
          await integrationQueue.addBulk(
            pageAttachmentIds.map((attachmentId) => ({
              name: IntegrationJobAction.coexistAttachmentDownload,
              data: {
                type: IntegrationJobAction.coexistAttachmentDownload,
                data: {
                  attachmentId,
                  workspaceId,
                  channel: "messenger" as const,
                  integrationId: ctx.integrationId,
                },
              },
              opts: {
                jobId: `att-${attachmentId}`,
                attempts: 5,
                backoff: { type: "exponential", delay: 30_000 },
                removeOnComplete: true,
                removeOnFail: { count: 100 },
              },
            })),
          )
        } catch (error) {
          logger.error(
            { error, runId, pageNumber, count: pageAttachmentIds.length },
            "[coexist] Messenger attachment download enqueue failed — bytes left as pending",
          )
        }
      }

      await db
        .update(coexistSyncRunModel)
        .set({
          importedMessageCount: sql`${coexistSyncRunModel.importedMessageCount} + ${pageImported}`,
          skippedCount: sql`${coexistSyncRunModel.skippedCount} + ${pageSkipped}`,
          failedCount: sql`${coexistSyncRunModel.failedCount} + ${pageFailed}`,
          lastSyncedAt: pageOldest,
          currentStep: `phase=messages page ${pageNumber} processed`,
          currentError: ctx.errorRef.current ?? null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      return pageOldest
    },
  )
}

/**
 * Page-per-job historical Messenger sync. Splits into two sequential phases:
 *
 *  - **contacts** — walk `/me/conversations` DESC, dedup participants, bulk
 *    upsert Contacts, dispatch avatar fetch jobs. No `/messages` calls.
 *  - **messages** — re-walk `/me/conversations` DESC; per conv, fetch
 *    `/messages`, run discovery, bulk-insert into the resolved contact.
 *
 * Phase boundary is persisted on `CoexistSyncRun.messengerSyncPhase`. When
 * phase=contacts finishes, the run flips to phase=messages with
 * `lastSyncedAt=NULL` so phase 2 walks from newest. The job hot-chains a
 * continuation when the chunk budget exhausts.
 *
 * Idempotent via `Message_(contactInboxId, sourceId)_key`.
 */
export const coexistMessengerSync = async (
  data: IntegrationJobCoexistMessengerSync["data"],
): Promise<void> => {
  const { runId, integrationId, workspaceId } = data
  const jobStart = Date.now()

  const failRun = async (currentError: string): Promise<void> => {
    await db
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coexistSyncRunModel.id, runId))
  }

  const integration = await db.query.integrationMessengerModel.findFirst({
    where: { id: integrationId },
  })
  if (!integration) {
    logger.warn({ integrationId }, "[coexist] Messenger integration gone")
    await failRun("Messenger integration not found")
    return
  }
  if (integration.workspaceId !== workspaceId) {
    logger.warn(
      { integrationId, workspaceId, rowWorkspaceId: integration.workspaceId },
      "[coexist] Messenger sync workspaceId mismatch — refusing",
    )
    await failRun("workspaceId mismatch between integration and run")
    return
  }
  if (!integration.coexistEnabled) {
    logger.info(
      { integrationId },
      "[coexist] Messenger sync skipped — disabled",
    )
    await failRun("Coexist disabled on integration")
    return
  }

  const parsedAuth = messengerAuthSchema.safeParse(integration.auth)
  if (!parsedAuth.success) {
    logger.error(
      { integrationId, error: parsedAuth.error.message },
      "[coexist] Messenger auth jsonb failed validation",
    )
    await failRun(`Messenger auth invalid: ${parsedAuth.error.message}`)
    return
  }
  const accessToken = parsedAuth.data.tokens.accessToken
  const version = parsedAuth.data.metadata?.version
  const { pageId } = integration

  const inbox = await findOrFail({
    table: inboxModel,
    where: { id: integration.inboxId },
    message: "Inbox not found",
  })

  const workspace = await db.query.workspaceModel.findFirst({
    where: { id: workspaceId },
    columns: { targetCountry: true },
  })
  const defaultCountry = workspace?.targetCountry ?? null

  const [initRow] = await db
    .select({
      attempts: coexistSyncRunModel.attempts,
      currentError: coexistSyncRunModel.currentError,
      messengerSyncPhase: coexistSyncRunModel.messengerSyncPhase,
    })
    .from(coexistSyncRunModel)
    .where(eq(coexistSyncRunModel.id, runId))
    .limit(1)

  if (!initRow) {
    logger.warn({ runId }, "[coexist] CoexistSyncRun row gone — abandoning")
    return
  }

  const ceiling = await fetchPriorRunCeiling(integrationId, runId)
  const attempts = initRow.attempts

  // Optimistic claim: only one worker may flip status→running at a time.
  const claimed = await db
    .update(coexistSyncRunModel)
    .set({
      status: "running",
      startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coexistSyncRunModel.id, runId),
        or(
          ne(coexistSyncRunModel.status, "running"),
          lt(
            coexistSyncRunModel.lastHeartbeatAt,
            sql`NOW() - INTERVAL '10 minutes'`,
          ),
        ),
      ),
    )
    .returning({ id: coexistSyncRunModel.id })

  if (claimed.length === 0) {
    logger.warn(
      { runId, integrationId },
      "[coexist] Messenger run already claimed by another worker — abandoning",
    )
    return
  }

  // ── Adaptive concurrency state (BUC-driven) ──────────────────────────────
  let currentConcurrency = DEFAULT_CONCURRENCY
  let currentLimit = pLimit(currentConcurrency)
  let pauseUntil = 0

  // Maximum in-process pause duration for a BUC budget exhaustion. A larger
  // value would hold the worker concurrency slot for too long and exceed the
  // chunk budget. Future improvement: re-enqueue with a BullMQ delay instead.
  const MAX_PAUSE_SEC = 300

  const applyBucThrottle = (usage: BucUsage | null | undefined): void => {
    const next = concurrencyForUsage(usage ?? null)
    if (next === 0) {
      const waitSec = Math.min(
        usage?.estimatedTimeToRegainAccess ?? 60,
        MAX_PAUSE_SEC,
      )
      pauseUntil = Math.max(pauseUntil, Date.now() + waitSec * 1000)
      if (currentConcurrency !== 1) {
        currentConcurrency = 1
        currentLimit = pLimit(1)
      }
      logger.warn(
        { waitSec, integrationId },
        "[coexist] BUC budget exhausted — pausing Graph calls",
      )
      return
    }
    if (next !== currentConcurrency) {
      currentConcurrency = next
      currentLimit = pLimit(next)
      logger.info(
        { next, integrationId },
        "[coexist] BUC throttle adjusted Messenger concurrency",
      )
    }
  }

  const respectPause = async (): Promise<void> => {
    if (Date.now() < pauseUntil) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, pauseUntil - Date.now()),
      )
    }
  }

  const errorRef = { current: initRow.currentError ?? undefined }
  const ctx: SyncContext = {
    runId,
    integrationId,
    workspaceId,
    pageId,
    accessToken,
    version,
    inbox,
    defaultCountry,
    ceiling,
    applyBucThrottle,
    respectPause,
    getLimit: () => currentLimit,
    jobStart,
    errorRef,
  }

  let finalStatus: "succeeded" | "failed" | "partial" | null = null
  let continueLater = false
  let lastPageNumber = 0
  let currentPhase = initRow.messengerSyncPhase

  try {
    // Run phases sequentially; each loop iteration either advances a phase
    // to completion, transitions, or yields when the chunk budget exhausts.
    while (true) {
      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      if (currentPhase === "contacts") {
        const result = await runContactsPhase(ctx)
        lastPageNumber = result.pageNumber
        if (!result.done) {
          continueLater = true
          break
        }
        // Transition to phase 2 — reset frontier so messages walks from newest.
        await db
          .update(coexistSyncRunModel)
          .set({
            messengerSyncPhase: "messages",
            lastSyncedAt: null,
            currentStep: "contacts done — start message phase",
            lastHeartbeatAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(coexistSyncRunModel.id, runId))
        currentPhase = "messages"
        continue
      }

      // phase === "messages"
      const result = await runMessagesPhase(ctx)
      lastPageNumber = result.pageNumber
      if (!result.done) {
        continueLater = true
        break
      }

      // Both phases complete — derive terminal status from counters.
      const [terminal] = await db
        .select({
          importedMessages: coexistSyncRunModel.importedMessageCount,
          skipped: coexistSyncRunModel.skippedCount,
          failed: coexistSyncRunModel.failedCount,
        })
        .from(coexistSyncRunModel)
        .where(eq(coexistSyncRunModel.id, runId))
        .limit(1)

      if (
        terminal &&
        terminal.failed > 0 &&
        (terminal.importedMessages > 0 || terminal.skipped > 0)
      ) {
        finalStatus = "partial"
      } else if (terminal && terminal.failed > 0) {
        finalStatus = "failed"
      } else {
        finalStatus = "succeeded"
      }
      break
    }

    if (continueLater) {
      try {
        await integrationQueue.add(
          IntegrationJobAction.coexistMessengerSync,
          {
            type: IntegrationJobAction.coexistMessengerSync,
            data: { runId, integrationId, workspaceId },
          },
          {
            jobId: `coexist-run-${runId}-${attempts}-page-${lastPageNumber + 1}`,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
          },
        )
        logger.info(
          { runId, lastPageNumber, integrationId, phase: currentPhase },
          "[coexist] Messenger sync chunk done — continuation enqueued",
        )
      } catch (error) {
        logger.error(
          { error, runId },
          "[coexist] Messenger continuation enqueue failed — fallback to scheduler",
        )
        await db
          .update(coexistSyncRunModel)
          .set({
            status: "init",
            lastHeartbeatAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(coexistSyncRunModel.id, runId))
      }
    }
  } catch (error) {
    finalStatus = "failed"
    errorRef.current =
      error instanceof Error
        ? error.message
        : "Unknown error during Messenger sync"
    logger.error(error, "[coexist] Messenger sync encountered fatal error")
  } finally {
    if (finalStatus !== null) {
      await db
        .update(coexistSyncRunModel)
        .set({
          status: finalStatus,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          currentStep: "done",
          currentError: errorRef.current ?? null,
          updatedAt: new Date(),
        })
        .where(eq(coexistSyncRunModel.id, runId))
    }
  }

  logger.info(
    {
      integrationId,
      runId,
      finalStatus,
      currentPhase,
      continued: continueLater,
    },
    "[coexist] Messenger sync chunk complete",
  )
}
