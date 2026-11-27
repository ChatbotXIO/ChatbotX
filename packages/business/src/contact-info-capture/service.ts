import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ContactInfoSourceType } from "@chatbotx.io/database/partials"
import {
  type BroadcastRecipientAttributionState,
  broadcastRepository,
} from "@chatbotx.io/database/repositories"
import {
  type ContactInfoCaptureInput,
  contactInfoCaptureRepository,
} from "@chatbotx.io/database/repositories/contact-info-capture"
import { workspaceRepository } from "@chatbotx.io/database/repositories/workspace"
import type { ContactInfoCaptureSearchCursor } from "@chatbotx.io/worker-config"
import z from "zod"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { messageService } from "../message/service"
import {
  type BotSourceResolution,
  botSourceResolutionKinds,
  resolveLastBotSource,
} from "./classify"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Widening, non-overlapping look-back windows from the inbound message, in
 * days. Past the last one the search runs back to the conversation's first
 * message. Most replies are answered by the first window, so the wide ones are
 * only paid for by old conversations.
 */
const CONTACT_INFO_CAPTURE_WINDOW_DAYS = [1, 7, 30, 180] as const
/** Messages read per job run: one bounded page, so one run is one cheap query. */
export const CONTACT_INFO_CAPTURE_PAGE_SIZE = 50
/** Job runs one capture may use before it is dropped as undecidable. */
export const CONTACT_INFO_CAPTURE_MAX_RUNS = 20
const FIRST_ROW_ID = "0"

/** Why a search ended without a source. */
const contactInfoCaptureNoneReasons = z.enum([
  "noBotSource",
  "historyExhausted",
  "runCapReached",
])
type ContactInfoCaptureNoneReason = z.infer<
  typeof contactInfoCaptureNoneReasons
>

export const contactInfoCaptureSearchOutcomes = z.enum([
  "attributed",
  "none",
  "continue",
])

export type ContactInfoCaptureSearchInput = {
  /**
   * When the conversation was created. Messages are not expected to be older
   * (beyond a clock-skew margin), so the search stops there. Absent for jobs queued before the field existed: the service
   * then reads the conversation when it gets that far.
   */
  conversationCreatedAt?: Date
  conversationId: string
  cursor?: ContactInfoCaptureSearchCursor
  /** The inbound message that carried the phone or email. */
  inboundMessage: { createdAt: Date; id: string }
  workspaceId: string
}

export type ContactInfoCaptureSearchResult =
  | {
      outcome: typeof contactInfoCaptureSearchOutcomes.enum.attributed
      followedFlowId?: string
      sourceId: string
      sourceType: ContactInfoSourceType
    }
  | {
      outcome: typeof contactInfoCaptureSearchOutcomes.enum.none
      reason: ContactInfoCaptureNoneReason
    }
  | {
      outcome: typeof contactInfoCaptureSearchOutcomes.enum.continue
      cursor: ContactInfoCaptureSearchCursor
    }

/** What the transactional insert did; the caller maps it to done / retry / drop. */
export const contactInfoCaptureRecordResults = z.enum([
  "recorded",
  "alreadyRecorded",
  "workspaceUnavailable",
  "sourceNotAttributable",
  "recipientPending",
  "recipientFailed",
])
export type ContactInfoCaptureRecordResult = z.infer<
  typeof contactInfoCaptureRecordResults
>

export type ContactInfoCaptureRecordInput = ContactInfoCaptureInput & {
  followedFlowId?: string
}

type SourceLocker = (
  input: ContactInfoCaptureRecordInput,
  tx: DatabaseClient,
) => Promise<BroadcastRecipientAttributionState | null>

/** Locks the source row and reads the contact's state in it; one entry per source type. */
const SOURCE_LOCKERS: Record<ContactInfoSourceType, SourceLocker> = {
  broadcast: (input, tx) =>
    broadcastRepository.lockRecipientForAttribution(
      {
        broadcastId: input.sourceId,
        contactId: input.contactId,
        flowId: input.followedFlowId,
        workspaceId: input.workspaceId,
      },
      tx,
    ),
}

const none = (
  reason: ContactInfoCaptureNoneReason,
): ContactInfoCaptureSearchResult => ({
  outcome: contactInfoCaptureSearchOutcomes.enum.none,
  reason,
})

/**
 * `Conversation.createdAt` is stamped by PostgreSQL while messages carry the
 * worker's clock, and a broadcast creates the conversation a few ms before it
 * inserts its message. Skew can make a message look older than its own
 * conversation, so the carried start is only trusted this far back.
 */
export const CONVERSATION_START_SKEW_MARGIN_MS = 10 * 60 * 1000

/**
 * The earliest time the search may read, from the conversation start the job
 * carried: the start minus the skew margin. A bound later than the inbound
 * message cannot be right (the message belongs to the conversation), so it is
 * ignored and the normal path applies. The comparison is made after the margin
 * so a clock that is only slightly off does not throw the start away.
 */
const effectiveConversationStart = (
  conversationCreatedAt: Date | undefined,
  inboundAt: Date,
): Date | undefined => {
  if (!conversationCreatedAt) {
    return
  }
  const earliest = new Date(
    conversationCreatedAt.getTime() - CONVERSATION_START_SKEW_MARGIN_MS,
  )
  return earliest <= inboundAt ? earliest : undefined
}

const windowSince = (anchor: Date, days: number): Date =>
  new Date(anchor.getTime() - days * DAY_MS)

class ContactInfoCaptureService {
  /**
   * Reads one page of the conversation's bot history and decides what the bot
   * last said belongs to. Never writes. `continue` carries the cursor for the
   * next run; a failing shard read throws so the job retries rather than
   * deciding on partial history.
   */
  async findAttribution(
    rawInput: ContactInfoCaptureSearchInput,
  ): Promise<ContactInfoCaptureSearchResult> {
    // From here `conversationCreatedAt` is the skew-adjusted earliest start.
    const input: ContactInfoCaptureSearchInput = {
      ...rawInput,
      conversationCreatedAt: effectiveConversationStart(
        rawInput.conversationCreatedAt,
        rawInput.inboundMessage.createdAt,
      ),
    }
    const cursor: ContactInfoCaptureSearchCursor = input.cursor ?? {
      before: {
        createdAt: input.inboundMessage.createdAt.toISOString(),
        id: input.inboundMessage.id,
      },
      run: 0,
      windowIndex: 0,
    }
    if (cursor.run >= CONTACT_INFO_CAPTURE_MAX_RUNS) {
      return none(contactInfoCaptureNoneReasons.enum.runCapReached)
    }

    const since = await this.resolveWindowStart(input, cursor.windowIndex)
    if (!since) {
      return none(contactInfoCaptureNoneReasons.enum.historyExhausted)
    }

    const page = await messageService.listOutgoingBefore({
      before: cursor.before,
      conversationId: input.conversationId,
      limit: CONTACT_INFO_CAPTURE_PAGE_SIZE,
      since,
      workspaceId: input.workspaceId,
    })

    const resolution = resolveLastBotSource(page, {
      followedFlowId: cursor.followedFlowId,
    })
    if (resolution.kind === botSourceResolutionKinds.enum.attributed) {
      return {
        followedFlowId: resolution.followedFlowId,
        outcome: contactInfoCaptureSearchOutcomes.enum.attributed,
        sourceId: resolution.sourceId,
        sourceType: resolution.sourceType,
      }
    }
    if (resolution.kind === botSourceResolutionKinds.enum.stop) {
      return none(contactInfoCaptureNoneReasons.enum.noBotSource)
    }

    return this.nextRun(
      cursor,
      since,
      page,
      resolution,
      input.conversationCreatedAt,
    )
  }

  /**
   * The lower bound of a window, or `undefined` when the history is exhausted.
   * A fixed window reaches back a number of days but never before the
   * conversation's start. Past the fixed windows it is the conversation's first
   * message: taken from the job when known, else one primary key read (only
   * when the last fixed window was reached).
   */
  private async resolveWindowStart(
    input: ContactInfoCaptureSearchInput,
    windowIndex: number,
  ): Promise<Date | undefined> {
    const days = CONTACT_INFO_CAPTURE_WINDOW_DAYS[windowIndex]
    if (days !== undefined) {
      const since = windowSince(input.inboundMessage.createdAt, days)
      const start = input.conversationCreatedAt
      return start && start > since ? start : since
    }

    if (input.conversationCreatedAt) {
      return input.conversationCreatedAt
    }
    const conversation = await conversationService.findByUncached({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
    })
    return conversation?.createdAt
  }

  /**
   * A full page stays in the same window, resuming before its last message. A
   * short page means the window is exhausted: the next window starts just
   * below this window's lower bound, so windows never overlap.
   */
  private nextRun(
    cursor: ContactInfoCaptureSearchCursor,
    since: Date,
    page: { createdAtExact: string; id: string }[],
    resolution: Extract<
      BotSourceResolution,
      { kind: typeof botSourceResolutionKinds.enum.continue }
    >,
    conversationCreatedAt?: Date,
  ): ContactInfoCaptureSearchResult {
    const last = page.at(-1)
    const isFullPage = page.length >= CONTACT_INFO_CAPTURE_PAGE_SIZE
    if (!(isFullPage && last)) {
      // Nothing older than the conversation's first message exists: a window
      // that already reaches it (or the last window) ends the search.
      const reachesConversationStart =
        conversationCreatedAt !== undefined && since <= conversationCreatedAt
      if (
        reachesConversationStart ||
        cursor.windowIndex > CONTACT_INFO_CAPTURE_WINDOW_DAYS.length - 1
      ) {
        return none(contactInfoCaptureNoneReasons.enum.historyExhausted)
      }
      return {
        cursor: {
          before: { createdAt: since.toISOString(), id: FIRST_ROW_ID },
          followedFlowId: resolution.followedFlowId,
          run: cursor.run + 1,
          windowIndex: cursor.windowIndex + 1,
        },
        outcome: contactInfoCaptureSearchOutcomes.enum.continue,
      }
    }

    return {
      cursor: {
        before: { createdAt: last.createdAtExact, id: last.id },
        followedFlowId: resolution.followedFlowId,
        run: cursor.run + 1,
        windowIndex: cursor.windowIndex,
      },
      outcome: contactInfoCaptureSearchOutcomes.enum.continue,
    }
  }

  /**
   * Writes the capture in one transaction, in the fixed lock order Workspace ->
   * source (Broadcast, `FOR SHARE`) -> Contact (`FOR KEY SHARE` inside the
   * insert). Only a recipient the channel marked delivered counts: neither
   * delivered nor failed yet is `recipientPending` (the caller waits and
   * retries), failed alone is `recipientFailed` (drop).
   */
  async record(
    input: ContactInfoCaptureRecordInput,
  ): Promise<ContactInfoCaptureRecordResult> {
    const write = async (
      client: DatabaseClient,
    ): Promise<ContactInfoCaptureRecordResult> => {
      const canWrite = await workspaceRepository.lockWorkspaceForChildWrite(
        { workspaceId: input.workspaceId },
        client,
      )
      if (!canWrite) {
        return contactInfoCaptureRecordResults.enum.workspaceUnavailable
      }

      const recipient = await SOURCE_LOCKERS[input.sourceType](input, client)
      if (!recipient) {
        return contactInfoCaptureRecordResults.enum.sourceNotAttributable
      }
      // Delivered wins even if a later failure was also recorded.
      if (!recipient.deliveredAt) {
        return recipient.failedAt
          ? contactInfoCaptureRecordResults.enum.recipientFailed
          : contactInfoCaptureRecordResults.enum.recipientPending
      }

      const inserted = await contactInfoCaptureRepository.insert(input, client)
      return inserted > 0
        ? contactInfoCaptureRecordResults.enum.recorded
        : contactInfoCaptureRecordResults.enum.alreadyRecorded
    }

    const result = await db.transaction(write)
    logger.debug(
      { result, sourceId: input.sourceId, workspaceId: input.workspaceId },
      "contact-info-capture: record finished",
    )
    return result
  }
}

export const contactInfoCaptureService = new ContactInfoCaptureService()
