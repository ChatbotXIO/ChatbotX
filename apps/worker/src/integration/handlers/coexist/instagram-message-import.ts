import {
  bulkImportMessages,
  type CoexistActivityUpdate,
  type ContactImportLink,
  type createHistoricalIdFactory,
  type HistoricalMessage,
} from "./bulk-historical-import"
import type { PullCoexistAdapter } from "./pull-adapter"

/** What writing one page of an Instagram conversation's messages did. */
export type InstagramMessagePageResult = {
  /** How many messages the page held: the next page's `totalSeen` grows by it. */
  messagesRead: number
  importedMessages: number
  skippedMessages: number
  /** The conversation's activity bump for this page; null when nothing was written. */
  activity: CoexistActivityUpdate | null
}

/**
 * Normalizes one Graph page of an Instagram conversation's messages and writes
 * it for a known contact. Shared by the coexist history sync (which resolves
 * the contact from the conversation) and the AhaChat import (which already
 * has the contact). `totalSeen` is the count of messages of the conversation
 * read before this page, so the "newest 100 are kept" rule spans pages.
 */
export const importInstagramMessagePage = async <Ctx, Conv, Msg>(input: {
  adapter: PullCoexistAdapter<Ctx, Conv, Msg>
  context: Ctx
  aiReadsSyncedHistory: boolean
  workspaceId: string
  runId: string
  link: ContactImportLink
  messages: Msg[]
  cutoff: Date
  totalSeen: number
  idFactory: ReturnType<typeof createHistoricalIdFactory>
}): Promise<InstagramMessagePageResult> => {
  const { adapter, context, link } = input
  const historicalMessages: HistoricalMessage[] = []
  let seen = input.totalSeen
  for (const message of input.messages) {
    seen += 1
    const historical = adapter.toHistoricalMessage({
      context,
      message,
      cutoff: input.cutoff,
      totalMessagesSeen: seen,
    })
    if (historical) {
      historicalMessages.push(historical)
    }
  }

  const imported = await bulkImportMessages({
    workspaceId: input.workspaceId,
    runId: input.runId,
    contactInboxId: link.contactInboxId,
    contactId: link.contactId,
    conversationId: link.conversationId,
    messages: historicalMessages,
    contactEnrichment: adapter.discoverContactEnrichment({
      context,
      messages: historicalMessages,
    }),
    idFactory: input.idFactory,
  })

  const aiMarkerMessageId = input.aiReadsSyncedHistory
    ? null
    : imported.newestMessageId
  const activity: CoexistActivityUpdate | null =
    imported.newestMessageAt !== null || aiMarkerMessageId !== null
      ? {
          contactInboxId: link.contactInboxId,
          contactId: link.contactId,
          conversationId: link.conversationId,
          newestMessageAt: imported.newestMessageAt,
          oldestMessageAt: imported.oldestMessageAt,
          newestIncomingMessageAt: imported.newestIncomingMessageAt,
          aiMarkerMessageId,
        }
      : null
  return {
    messagesRead: input.messages.length,
    importedMessages: imported.importedMessages,
    skippedMessages: imported.skippedMessages,
    activity,
  }
}
