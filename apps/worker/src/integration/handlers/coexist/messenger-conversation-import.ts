import type { BucUsage } from "@chatbotx.io/integration-messenger/apis/usage"
import {
  bulkImportMessages,
  type CoexistActivityUpdate,
  type ContactImportLink,
  type createHistoricalIdFactory,
  maxNumericId,
} from "./bulk-historical-import"
import { fetchConvMessages } from "./messenger-helpers"

/** What importing one Messenger conversation wrote. */
export type MessengerConversationImportResult = {
  importedMessages: number
  skippedMessages: number
  /** The activity bump of the conversation; null when nothing was written. */
  activity: CoexistActivityUpdate | null
}

export const emptyTally = (): MessengerConversationImportResult => ({
  importedMessages: 0,
  skippedMessages: 0,
  activity: null,
})

export type MessengerConversationImportInput = {
  workspaceId: string
  runId: string
  conversationId: string
  link: ContactImportLink
  /** Messages older than this are skipped (the newest 100 are always kept). */
  cutoff: Date
  ceiling: Date | null
  pageId: string
  accessToken: string
  version: string | undefined
  defaultCountry: string | null
  /** When false, the AI ignores the history this import writes. */
  aiReadsSyncedHistory: boolean
  applyBucThrottle: (usage: BucUsage | null | undefined) => void
  respectPause: () => Promise<void>
  /** One factory per chunk: its same-millisecond probe spans conversations. */
  idFactory: ReturnType<typeof createHistoricalIdFactory>
  /**
   * Updated after every written Graph page, so a caller whose import fails on a
   * later page still sees what the earlier pages wrote. Defaults to a fresh one.
   */
  tally?: MessengerConversationImportResult
}

/**
 * Walks one Messenger conversation's messages and writes each Graph page as it
 * arrives, so no conversation is ever held in memory whole. Shared by the
 * coexist history sync (which walks `/conversations`) and the AhaChat import
 * (which already knows whose conversation to read). A failure throws: the
 * caller counts it for its own run, and reads what was already written from
 * `input.tally`.
 */
export const importMessengerConversation = async (
  input: MessengerConversationImportInput,
): Promise<MessengerConversationImportResult> => {
  const { link, workspaceId, runId } = input
  const tally = input.tally ?? emptyTally()
  // A caller that retries after a failed attempt hands the same tally back:
  // this walk adds to what the earlier one wrote instead of replacing it.
  let importedMessages = tally.importedMessages
  let skippedMessages = tally.skippedMessages
  // Newest message time across the conversation's pages: one activity bump per
  // conversation, not per page.
  let newest: Date | null = tally.activity?.newestMessageAt ?? null
  let oldest: Date | null = tally.activity?.oldestMessageAt ?? null
  let newestIncoming: Date | null =
    tally.activity?.newestIncomingMessageAt ?? null
  let newestMessageId: string | null = tally.activity?.aiMarkerMessageId ?? null

  const buildActivity = (): CoexistActivityUpdate | null => {
    const aiMarkerMessageId = input.aiReadsSyncedHistory
      ? null
      : newestMessageId
    if (!(newest || aiMarkerMessageId)) {
      return null
    }
    return {
      contactInboxId: link.contactInboxId,
      contactId: link.contactId,
      conversationId: link.conversationId,
      newestMessageAt: newest,
      oldestMessageAt: oldest ?? newest,
      newestIncomingMessageAt: newestIncoming,
      aiMarkerMessageId,
    }
  }

  await fetchConvMessages({
    conversationId: input.conversationId,
    accessToken: input.accessToken,
    version: input.version,
    cutoff: input.cutoff,
    ceiling: input.ceiling,
    pageId: input.pageId,
    defaultCountry: input.defaultCountry,
    applyBucThrottle: input.applyBucThrottle,
    respectPause: input.respectPause,
    // Flush each Graph page at once; `pageDiscovered` is the live enrichment
    // object, so everything found so far is passed.
    onPage: async (pageMessages, pageDiscovered) => {
      const result = await bulkImportMessages({
        workspaceId,
        runId,
        contactInboxId: link.contactInboxId,
        contactId: link.contactId,
        conversationId: link.conversationId,
        messages: pageMessages,
        contactEnrichment: pageDiscovered,
        idFactory: input.idFactory,
      })
      importedMessages += result.importedMessages
      skippedMessages += result.skippedMessages
      if (
        result.newestMessageAt &&
        (!newest || newest < result.newestMessageAt)
      ) {
        newest = result.newestMessageAt
      }
      if (
        result.oldestMessageAt &&
        (!oldest || oldest > result.oldestMessageAt)
      ) {
        oldest = result.oldestMessageAt
      }
      if (
        result.newestIncomingMessageAt &&
        (!newestIncoming || newestIncoming < result.newestIncomingMessageAt)
      ) {
        newestIncoming = result.newestIncomingMessageAt
      }
      newestMessageId = maxNumericId(newestMessageId, result.newestMessageId)
      tally.importedMessages = importedMessages
      tally.skippedMessages = skippedMessages
      tally.activity = buildActivity()
    },
  })

  return tally
}
