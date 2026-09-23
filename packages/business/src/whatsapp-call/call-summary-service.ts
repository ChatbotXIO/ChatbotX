import type {
  WhatsappCallAiSummary,
  WhatsappCallTranscriptSegments,
} from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import { getWhatsappCallEntity } from "@chatbotx.io/sdk"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { notFoundException, summaryAlreadyGeneratingException } from "../errors"
import { logger } from "../logger"
import { broadcastToWorkspaceParty } from "../platform/realtime-broadcast"
import { userService } from "../user/service"
import { workspaceService } from "../workspace/service"

/**
 * Non-blocking: a concurrent Regenerate click must fail fast with an already-
 * generating signal, never queue behind the in-flight one.
 */
const SUMMARY_LOCK_TIMEOUT_SECONDS = 60
const SUMMARY_LOCK_RETRY_TIMEOUT_SECONDS = 0

/**
 * Mirrors callActivitySourceId in the worker's whatsapp-call-finalize.ts
 * (duplicated since that module isn't in a shared package) - keep in sync.
 */
const callActivitySourceId = (callId: string): string => `wacall-${callId}`

export type CallTranscriptSegment = {
  speaker?: string
  start: number
  end: number
  text: string
}

export type CallTranscriptSpeakerNames = {
  business: string
  customer: string
}

export type CallTranscriptResult = {
  segments: CallTranscriptSegment[]
  speakerNames: CallTranscriptSpeakerNames
  hasSpeakers: boolean
  /**
   * Auto-detected transcript language - not currently persisted, always
   * undefined.
   */
  language?: string
}

const flattenSegments = (segments: WhatsappCallTranscriptSegments): string =>
  segments.map((segment) => segment.text).join(" ")

class WhatsappCallTranscriptService {
  /** Workspace-scoped: throws rather than silently returning another workspace's call. */
  async loadCallForWorkspace(props: {
    callId: string
    workspaceId: string
  }): Promise<WhatsappCallModel> {
    // Workspace-scoped in the SQL WHERE clause too (defense in depth); the app-
    // level check is kept rather than relied on as the only gate.
    const call = await whatsappCallRepository.findByIdForWorkspace(
      props.callId,
      props.workspaceId,
    )
    if (!call || call.workspaceId !== props.workspaceId) {
      throw notFoundException("Call not found")
    }
    return call
  }

  /**
   * Diarized (Meta-native) or flat, timestamped (browser recording) segments,
   * mapped to agent/contact display names. Empty segments is a valid
   * unavailable result, never thrown as an error.
   */
  async getTranscriptForCall(props: {
    callId: string
    workspaceId: string
  }): Promise<CallTranscriptResult> {
    const call = await this.loadCallForWorkspace(props)
    const segments = call.transcriptSegments ?? []
    const hasSpeakers = segments.some((segment) => Boolean(segment.speaker))
    const speakerNames = await this.resolveSpeakerNames(call)

    return {
      segments: segments.map((segment) => ({
        speaker: segment.speaker,
        start: segment.start,
        end: segment.end,
        text: segment.text,
      })),
      speakerNames,
      hasSpeakers,
    }
  }

  /**
   * The flat text fed to the AI summarizer - prefers the flat transcript
   * column, falling back to flattening transcriptSegments for a row that only
   * has the latter. Returns "" (never throws) when nothing is available; the
   * caller decides how to surface an empty transcript.
   */
  async getTranscriptTextForCall(props: {
    callId: string
    workspaceId: string
  }): Promise<string> {
    const call = await this.loadCallForWorkspace(props)
    if (call.transcript) {
      return call.transcript
    }
    return call.transcriptSegments
      ? flattenSegments(call.transcriptSegments)
      : ""
  }

  /**
   * "Business" maps to the placing/answering agent's display name, "Customer"
   * to the contact's. Falls back to "" (never a hardcoded English placeholder)
   * so the UI applies its own localized fallback.
   */
  private async resolveSpeakerNames(
    call: WhatsappCallModel,
  ): Promise<CallTranscriptSpeakerNames> {
    const agentUserId =
      call.direction === "businessInitiated"
        ? call.initiatedByUserId
        : call.answeredByUserId

    const [business, customer] = await Promise.all([
      this.resolveAgentName({ workspaceId: call.workspaceId, agentUserId }),
      this.resolveCustomerName(call),
    ])

    return { business, customer }
  }

  private async resolveAgentName(props: {
    workspaceId: string
    agentUserId: string | null
  }): Promise<string> {
    if (props.agentUserId) {
      const user = await userService.findNameAndEmail(props.agentUserId)
      if (user?.name) {
        return user.name
      }
    }
    const workspace = await workspaceService.find({
      where: { id: props.workspaceId },
    })
    return workspace?.name ?? ""
  }

  private async resolveCustomerName(call: WhatsappCallModel): Promise<string> {
    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (!contactInbox) {
      return ""
    }
    const contact = await contactService.findById({
      workspaceId: call.workspaceId,
      id: contactInbox.contactId,
    })
    return contact?.fullName ?? contact?.phoneNumber ?? ""
  }
}

export const whatsappCallTranscriptService = new WhatsappCallTranscriptService()

class WhatsappCallSummaryService {
  /**
   * The AI Summary tab's read - undefined when no summary has been generated
   * yet, a valid non-error state the sheet renders as the Generate summary
   * prompt.
   */
  async getSummaryForCall(props: {
    callId: string
    workspaceId: string
  }): Promise<
    | {
        aiSummary: WhatsappCallAiSummary
        aiSummaryProvider: string | null
      }
    | undefined
  > {
    const call = await whatsappCallTranscriptService.loadCallForWorkspace(props)
    if (!call.aiSummary) {
      return
    }
    return {
      aiSummary: call.aiSummary,
      aiSummaryProvider: call.aiSummaryProvider,
    }
  }

  /**
   * Persists the on-demand AI summary, enriches the call activity message
   * (hasSummary: true), and broadcasts messageContentUpdated. Whether the
   * write is a first-write or an overwrite is derived from the call's
   * current aiSummarizedAt, never passed by the caller.
   */
  async attachSummary(props: {
    callId: string
    workspaceId: string
    aiSummary: WhatsappCallAiSummary
    provider: string
  }): Promise<void> {
    const call = await whatsappCallTranscriptService.loadCallForWorkspace({
      callId: props.callId,
      workspaceId: props.workspaceId,
    })

    // Non-blocking lock: a concurrent Regenerate click fails fast instead of
    // queueing behind the in-flight (paid) provider call.
    const lockKey = `whatsapp-call-summary:${call.id}`

    try {
      await distributedLock.runExclusive({
        key: lockKey,
        timeoutInSeconds: SUMMARY_LOCK_TIMEOUT_SECONDS,
        retryTimeoutInSeconds: SUMMARY_LOCK_RETRY_TIMEOUT_SECONDS,
        fn: async () => {
          const write = call.aiSummarizedAt
            ? whatsappCallRepository.overwriteAiSummary.bind(
                whatsappCallRepository,
              )
            : whatsappCallRepository.attachAiSummary.bind(
                whatsappCallRepository,
              )

          await write({
            id: call.id,
            aiSummary: props.aiSummary,
            aiSummaryProvider: props.provider,
          })

          await this.enrichCallActivityMessage(call)
        },
      })
    } catch (error) {
      if (isLockAcquisitionError(error, lockKey)) {
        throw summaryAlreadyGeneratingException()
      }
      throw error
    }
  }

  private async enrichCallActivityMessage(
    call: Pick<WhatsappCallModel, "id" | "conversationId" | "workspaceId">,
  ): Promise<void> {
    const sourceId = callActivitySourceId(call.id)
    const repository = await createMessageRepository()

    // Atomic jsonb merge of just hasSummary, so it can't clobber a concurrent
    // hasRecording/hasTranscript writer on the same message.
    const merged = await repository.mergeContentAttributesBySourceId(
      sourceId,
      call.workspaceId,
      { hasSummary: true },
    )
    if (!merged) {
      logger.info(
        { callId: call.id },
        "Whatsapp call: no finalize message to enrich with AI summary yet",
      )
      return
    }

    const entity = getWhatsappCallEntity(merged.contentAttributes)
    if (!entity) {
      return
    }

    try {
      await broadcastToWorkspaceParty(call.workspaceId, {
        eventType: RealtimeEventType.messageContentUpdated,
        data: { messageId: merged.id, contentAttributes: entity },
      })
    } catch (error) {
      logger.warn(
        { err: error, callId: call.id },
        "Whatsapp call: unable to emit realtime event for AI summary",
      )
    }
  }
}

export const whatsappCallSummaryService = new WhatsappCallSummaryService()
