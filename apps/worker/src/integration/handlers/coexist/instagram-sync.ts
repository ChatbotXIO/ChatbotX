import { coexistService } from "@chatbotx.io/business"
import type {
  InboxModel,
  IntegrationInstagramModel,
} from "@chatbotx.io/database/types"
import {
  IntegrationJobAction,
  type IntegrationJobCoexistInstagramSync,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import pLimit from "p-limit"
import { logger } from "../../../lib/logger"
import {
  applyCoexistActivityUpdates,
  bulkImportContacts,
  bulkImportMessages,
  type CoexistActivityUpdate,
  type ContactImportLink,
  createHistoricalIdFactory,
  type HistoricalMessage,
} from "./bulk-historical-import"
import { instagramCoexistAdapter } from "./instagram-adapter"
import { instagramFacebookCoexistAdapter } from "./instagram-facebook-adapter"
import { splitDisplayName } from "./instagram-normalize"
import type { CoexistUsageSignal, PullCoexistAdapter } from "./pull-adapter"
import { resolveUsageThrottle, sleepForUsageThrottle } from "./usage-throttle"

const DEFAULT_CONCURRENCY = 3
const CHUNK_BUDGET_MS = 4 * 60 * 1000
const MAX_USAGE_PAUSE_MS = 45_000
const STORE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

type InstagramIntegrationType = IntegrationInstagramModel["type"]

// Generic pull engine shared by both Instagram coexist providers. Every
// provider-specific concern (which Graph client/endpoint/token, how messages
// normalize) lives behind the adapter; the run lifecycle, throttle, and bulk
// import are identical. `Ctx` must carry the resolved inbox and `Conv` an id so
// the engine can drive imports without knowing the provider.
const runInstagramCoexistPull = async <
  Ctx extends { inbox: InboxModel },
  Conv extends { id: string },
  Msg,
>(
  adapter: PullCoexistAdapter<Ctx, Conv, Msg>,
  data: IntegrationJobCoexistInstagramSync["data"],
): Promise<void> => {
  const { runId, integrationId, workspaceId } = data
  const jobStart = Date.now()

  const failRun = (currentError: string): Promise<void> =>
    coexistService.markFailed({ runId, currentError })

  const initialContext = await adapter.loadContext({
    workspaceId,
    integrationId,
  })
  if (!initialContext) {
    await failRun("Instagram integration not found or coexist disabled")
    return
  }
  const claimed = await coexistService.claimRun({ runId })
  if (!claimed) {
    logger.warn(
      { runId, integrationId },
      "[coexist] Instagram run already claimed by another worker",
    )
    return
  }
  const context = await adapter.loadContext({
    workspaceId,
    integrationId,
  })
  if (!context) {
    await failRun(
      "Instagram integration not found or coexist disabled after claim",
    )
    return
  }

  const ceiling = await coexistService.findResumeCeiling({
    integrationId,
    channel: "instagram",
    currentRunId: runId,
  })
  const cutoff = new Date(Date.now() - STORE_WINDOW_MS)
  const idFactory = createHistoricalIdFactory()
  let currentConcurrency = DEFAULT_CONCURRENCY
  let limit = pLimit(currentConcurrency)
  let pauseUntil = 0
  const frontier = claimed.lastSyncedAt
  let cursor: string | undefined
  let pageNumber = claimed.currentPageNumber ?? 0
  let importedContactTotal = claimed.importedContactCount ?? 0
  let importedMessageTotal = claimed.importedMessageCount ?? 0
  let skippedTotal = claimed.skippedCount ?? 0
  let failedTotal = claimed.failedCount ?? 0
  let continueLater = false
  let currentError: string | undefined

  const applyUsageThrottle = (
    usageSignal: CoexistUsageSignal | null | undefined,
  ): void => {
    const decision = resolveUsageThrottle({
      signal: usageSignal,
      defaultConcurrency: DEFAULT_CONCURRENCY,
      maxPauseMs: MAX_USAGE_PAUSE_MS,
    })
    if (decision.pauseMs > 0) {
      pauseUntil = Math.max(pauseUntil, Date.now() + decision.pauseMs)
      logger.warn(
        { runId, usageSignal, pauseMs: decision.pauseMs },
        "[coexist] Instagram usage budget exhausted; pausing Graph calls",
      )
    }

    const nextConcurrency = decision.concurrency > 0 ? decision.concurrency : 1
    if (nextConcurrency !== currentConcurrency) {
      currentConcurrency = nextConcurrency
      limit = pLimit(currentConcurrency)
      logger.info(
        { runId, usageSignal, concurrency: currentConcurrency },
        "[coexist] Instagram usage throttle adjusted concurrency",
      )
    }
  }

  const respectUsagePause = async (): Promise<void> => {
    const waitMs = pauseUntil - Date.now()
    if (waitMs > 0) {
      await sleepForUsageThrottle(waitMs)
    }
  }

  try {
    while (true) {
      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      await respectUsagePause()
      const page = await adapter.listConversations({
        context,
        cursor,
      })
      applyUsageThrottle(page.usageSignal)
      pageNumber += 1

      const activityUpdates: CoexistActivityUpdate[] = []
      const attachmentIds: string[] = []
      let pageImportedContacts = 0
      let pageImportedMessages = 0
      let pageSkipped = 0
      let pageFailed = 0
      let pageOldest: Date | null = null

      await Promise.all(
        page.conversations.map((conversation) =>
          limit(async () => {
            await respectUsagePause()
            const conversationUpdatedAt = adapter.getConversationUpdatedAt({
              conversation,
            })
            if (
              conversationUpdatedAt &&
              frontier &&
              conversationUpdatedAt >= frontier
            ) {
              return
            }
            if (
              conversationUpdatedAt &&
              ceiling &&
              conversationUpdatedAt <= ceiling
            ) {
              return
            }

            try {
              let messageCursor: string | undefined
              let contactLink: ContactImportLink | null = null
              let totalMessagesSeen = 0
              const pendingMessages: Msg[] = []

              while (true) {
                await respectUsagePause()
                const messagesPage = await adapter.fetchConversationMessages({
                  context,
                  conversationId: conversation.id,
                  cursor: messageCursor,
                })
                applyUsageThrottle(messagesPage.usageSignal)
                pendingMessages.push(...messagesPage.messages)

                if (!contactLink) {
                  let contact = adapter.resolveContact({
                    context,
                    conversation,
                    messages: pendingMessages,
                  })
                  if (!contact) {
                    messageCursor = messagesPage.after
                    if (!messageCursor) {
                      pageSkipped += Math.max(1, pendingMessages.length)
                      return
                    }
                    continue
                  }

                  // Resolve the real display name from the user node and split
                  // it into first/last name. Best-effort: on failure we keep the
                  // participant-derived fallback (username). Providers whose
                  // participants already carry `name` don't implement this.
                  if (adapter.resolveContactProfile) {
                    await respectUsagePause()
                    try {
                      const profile = await adapter.resolveContactProfile({
                        context,
                        sourceId: contact.sourceId,
                      })
                      if (profile) {
                        // Feed the profile call's Graph usage into the throttle,
                        // same as conversation/message pulls.
                        applyUsageThrottle(profile.usageSignal)
                        if (profile.name) {
                          const { firstName, lastName } = splitDisplayName(
                            profile.name,
                          )
                          contact = {
                            ...contact,
                            firstName: firstName ?? contact.firstName,
                            lastName: lastName ?? contact.lastName,
                          }
                        }
                      }
                    } catch (err) {
                      logger.warn(
                        { err, runId, sourceId: contact.sourceId },
                        "[coexist] Instagram contact profile resolution failed",
                      )
                    }
                  }

                  // TODO(product): coexist import consumes contact quota with no
                  // pre-run plan gating. A mid-run quota error is caught per
                  // conversation below and resolves the run to `partial`; decide
                  // whether large historical imports should be plan-gated.
                  const contactResult = await bulkImportContacts({
                    inbox: context.inbox,
                    workspaceId,
                    contacts: [contact],
                  })
                  pageImportedContacts += contactResult.importedContacts
                  pageSkipped += contactResult.skippedContacts
                  if (contactResult.failureReason) {
                    currentError = contactResult.failureReason
                  }

                  const link = contactResult.contactInboxIds.get(
                    contact.sourceId,
                  )
                  if (!link) {
                    pageSkipped += pendingMessages.length
                    return
                  }
                  contactLink = link
                }

                const historicalMessages: HistoricalMessage[] = []
                for (const message of pendingMessages.splice(0)) {
                  totalMessagesSeen += 1
                  const historical = adapter.toHistoricalMessage({
                    context,
                    message,
                    cutoff,
                    totalMessagesSeen,
                  })
                  if (historical) {
                    historicalMessages.push(historical)
                  }
                }

                const imported = await bulkImportMessages({
                  workspaceId,
                  runId,
                  contactInboxId: contactLink.contactInboxId,
                  contactId: contactLink.contactId,
                  conversationId: contactLink.conversationId,
                  messages: historicalMessages,
                  contactEnrichment: adapter.discoverContactEnrichment({
                    context,
                    messages: historicalMessages,
                  }),
                  idFactory,
                })

                pageImportedMessages += imported.importedMessages
                pageSkipped += imported.skippedMessages
                attachmentIds.push(...imported.insertedAttachmentIds)

                if (imported.newestMessageAt && imported.oldestMessageAt) {
                  activityUpdates.push({
                    contactInboxId: contactLink.contactInboxId,
                    contactId: contactLink.contactId,
                    workspaceId,
                    conversationId: contactLink.conversationId,
                    newestMessageAt: imported.newestMessageAt,
                    oldestMessageAt: imported.oldestMessageAt,
                    newestIncomingMessageAt: imported.newestIncomingMessageAt,
                  })
                }

                messageCursor = messagesPage.after
                if (!messageCursor) {
                  break
                }
              }

              if (
                conversationUpdatedAt &&
                (!pageOldest || conversationUpdatedAt < pageOldest)
              ) {
                pageOldest = conversationUpdatedAt
              }
            } catch (err) {
              pageFailed += 1
              currentError =
                err instanceof Error
                  ? err.message
                  : "Unknown Instagram conversation sync error"
              logger.error(
                { err, runId, conversationId: conversation.id },
                "[coexist] Instagram conversation sync failed",
              )
            }
          }),
        ),
      )

      await applyCoexistActivityUpdates(activityUpdates)
      importedContactTotal += pageImportedContacts
      importedMessageTotal += pageImportedMessages
      skippedTotal += pageSkipped
      failedTotal += pageFailed

      if (attachmentIds.length > 0) {
        await integrationQueue.addBulk(
          attachmentIds.map((attachmentId) => ({
            name: IntegrationJobAction.coexistAttachmentDownload,
            data: {
              type: IntegrationJobAction.coexistAttachmentDownload,
              data: {
                attachmentId,
                workspaceId,
                channel: "instagram" as const,
                integrationId,
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
      }

      await coexistService.updateProgress({
        runId,
        fields: {
          importedContactCount: importedContactTotal,
          importedMessageCount: importedMessageTotal,
          skippedCount: skippedTotal,
          failedCount: failedTotal,
          currentPageNumber: pageNumber,
          // Only advance the resume watermark when this page actually processed a
          // conversation. On all-skipped/all-failed pages `pageOldest` is null;
          // writing it would wipe the watermark and force a full re-scan on the
          // next continuation (page order is DESC, so it only ever moves older).
          ...(pageOldest ? { lastSyncedAt: pageOldest } : {}),
          currentStep: `instagram page ${pageNumber} processed`,
          currentError: currentError ?? null,
          lastHeartbeatAt: new Date(),
        },
      })

      cursor = page.after
      if (!cursor) {
        break
      }
    }

    if (continueLater) {
      await integrationQueue.add(
        IntegrationJobAction.coexistInstagramSync,
        {
          type: IntegrationJobAction.coexistInstagramSync,
          data: { runId, integrationId, workspaceId },
        },
        {
          jobId: `coexist-run-${runId}-${claimed.attempts}-page-${pageNumber + 1}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { count: 100 },
        },
      )
      return
    }

    const finalRun = await coexistService.findRunById({ runId })
    if (
      finalRun &&
      finalRun.failedCount > 0 &&
      (finalRun.importedMessageCount > 0 || finalRun.skippedCount > 0)
    ) {
      await coexistService.markPartial({ runId, currentError })
      return
    }
    if (finalRun && finalRun.failedCount > 0) {
      await coexistService.markFailed({
        runId,
        currentError: currentError ?? "Instagram sync failed",
      })
      return
    }
    await coexistService.markSucceeded({ runId })
  } catch (err) {
    await failRun(
      err instanceof Error ? err.message : "Unknown Instagram sync error",
    )
    logger.error({ err }, "[coexist] Instagram sync encountered fatal error")
  }
}

// Provider registry keyed by Instagram integration type. Each entry binds its
// concrete adapter so the generic engine infers that adapter's own
// Ctx/Conv/Msg. Both providers share the same coexist channel ("instagram"),
// run rows, and job action — only the pull source differs. Adding a provider is
// one entry here plus its adapter; there is no branching to touch.
const instagramCoexistProvidersByType = {
  instagram: (data: IntegrationJobCoexistInstagramSync["data"]) =>
    runInstagramCoexistPull(instagramCoexistAdapter, data),
  facebook: (data: IntegrationJobCoexistInstagramSync["data"]) =>
    runInstagramCoexistPull(instagramFacebookCoexistAdapter, data),
} satisfies Record<
  InstagramIntegrationType,
  (data: IntegrationJobCoexistInstagramSync["data"]) => Promise<void>
>

export const coexistInstagramSync = async (
  data: IntegrationJobCoexistInstagramSync["data"],
): Promise<void> => {
  const { runId, integrationId, workspaceId } = data

  const integration = await coexistService.findIntegrationForCoexist({
    workspaceId,
    integrationId,
    channel: "instagram",
  })
  if (integration?.channel !== "instagram") {
    await coexistService.markFailed({
      runId,
      currentError: "Instagram integration not found or coexist disabled",
    })
    return
  }

  await instagramCoexistProvidersByType[integration.type](data)
}
