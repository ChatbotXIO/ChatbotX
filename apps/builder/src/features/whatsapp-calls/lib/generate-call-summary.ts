import type { AIProvider } from "@chatbotx.io/ai"
import {
  CallSummaryProviderNotConnectedError,
  generateCallSummary,
  listConnectedCallSummaryProviders,
} from "@chatbotx.io/ai/server"
import {
  whatsappCallSummaryService,
  whatsappCallTranscriptService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  summaryAlreadyGeneratingException,
} from "@chatbotx.io/business/errors"
import type { WhatsappCallAiSummary } from "@chatbotx.io/database/partials"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"

export const CALL_TRANSCRIPT_EMPTY_CODE = "callTranscriptEmpty"
export const CALL_SUMMARY_PROVIDER_NOT_CONNECTED_CODE =
  "callSummaryProviderNotConnected"
export const CALL_SUMMARY_PROVIDER_REQUIRED_CODE = "callSummaryProviderRequired"
const UNPROCESSABLE_STATUS = 422
// Held across the (paid) provider call so a second request for the same call
// fails fast instead of paying for a second summary. `attachSummary` takes its
// own short lock on a different key for the write.
const GENERATE_LOCK_TIMEOUT_SECONDS = 120

/**
 * Loads the call transcript, writes an AI summary with the chosen provider and
 * persists it (first write or Regenerate-overwrite). The builder action and the
 * public API both call this so they cannot drift. Access control stays with the
 * caller: the builder checks the member's call-artifact permission first, the
 * public route relies on the workspace-scoped lookups below (a call of another
 * workspace is a 404).
 */
export const generateCallSummaryForCall = async (input: {
  workspaceId: string
  callId: string
  /** Omitted: the workspace's only connected provider is used. */
  provider?: AIProvider
}): Promise<WhatsappCallAiSummary> => {
  const { workspaceId, callId } = input
  const transcriptText =
    await whatsappCallTranscriptService.getTranscriptTextForCall({
      callId,
      workspaceId,
    })
  if (!transcriptText.trim()) {
    throw new ChatbotXException(
      "This call has no transcript to summarize",
      CALL_TRANSCRIPT_EMPTY_CODE,
      UNPROCESSABLE_STATUS,
    )
  }

  const provider =
    input.provider ?? (await resolveOnlyConnectedProvider(workspaceId))

  const lockKey = `whatsapp-call-summary-generate:${callId}`
  try {
    return await distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: GENERATE_LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: 0,
      fn: async () => {
        const aiSummary = await summarize({
          workspaceId,
          provider,
          transcriptText,
        })
        await whatsappCallSummaryService.attachSummary({
          callId,
          workspaceId,
          aiSummary,
          provider,
        })
        return aiSummary
      },
    })
  } catch (error) {
    if (isLockAcquisitionError(error, lockKey)) {
      throw summaryAlreadyGeneratingException()
    }
    throw error
  }
}

/** The provider to use when the caller named none: exactly one must be connected. */
const resolveOnlyConnectedProvider = async (
  workspaceId: string,
): Promise<AIProvider> => {
  const connected = await listConnectedCallSummaryProviders(workspaceId)
  const [only] = connected
  if (connected.length === 1 && only) {
    return only.provider
  }
  if (connected.length === 0) {
    throw new ChatbotXException(
      "No AI integration is connected to this workspace",
      CALL_SUMMARY_PROVIDER_NOT_CONNECTED_CODE,
      UNPROCESSABLE_STATUS,
    )
  }
  throw new ChatbotXException(
    `Several AI providers are connected (${connected
      .map((item) => item.provider)
      .join(", ")}): pass \`provider\``,
    CALL_SUMMARY_PROVIDER_REQUIRED_CODE,
    UNPROCESSABLE_STATUS,
  )
}

const summarize = async (input: {
  workspaceId: string
  provider: AIProvider
  transcriptText: string
}): Promise<WhatsappCallAiSummary> => {
  try {
    return await generateCallSummary(input)
  } catch (error) {
    if (error instanceof CallSummaryProviderNotConnectedError) {
      throw new ChatbotXException(
        `The ${input.provider} integration is not connected to this workspace`,
        CALL_SUMMARY_PROVIDER_NOT_CONNECTED_CODE,
        UNPROCESSABLE_STATUS,
      )
    }
    throw error
  }
}
