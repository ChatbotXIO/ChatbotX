import {
  logProviderErrorForChannel,
  whatsappCallLifecycleService,
} from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { logger } from "@/lib/log"

/** Stored on the call when Meta refused to record it. */
export const META_RECORDING_ANNOUNCEMENT_REJECTED =
  "meta-rejected-recording-announcement"

/**
 * Meta refuses to record when the configured purpose/language is invalid, so
 * that refusal is also logged to the workspace error log, not just swallowed.
 * Never throws: bookkeeping must not fail a call that is already connected.
 */
export async function recordCallRecordingArrangement(input: {
  whatsappCallId: string
  workspaceId: string
  recordingRequested: boolean
  recordingWasRequested: boolean
  transcriptionWasRequested: boolean
  /** The announcement language actually sent, for diagnosing a refusal. */
  announcementLanguage?: string
  /** Length of the announcement purpose — never the text itself. */
  purposeChars?: number
  browserRecordingEnabled: boolean
  /** Meta's refusal, when the announcement was dropped to save the call. */
  announcementError?: unknown
}): Promise<void> {
  const rejectedByMeta =
    input.recordingWasRequested && !input.recordingRequested

  // One line per call carrying every input the recording/transcription
  // pipelines depend on: when an agent reports "no recording", this says
  // whether Meta was ever asked, with what, and whether it accepted.
  logger.info(
    {
      whatsappCallId: input.whatsappCallId,
      workspaceId: input.workspaceId,
      recordingWasRequested: input.recordingWasRequested,
      transcriptionWasRequested: input.transcriptionWasRequested,
      announcementLanguage: input.announcementLanguage ?? null,
      purposeChars: input.purposeChars ?? null,
      browserRecordingEnabled: input.browserRecordingEnabled,
      acceptedByMeta: !rejectedByMeta,
      recordingRequested: input.recordingRequested,
    },
    "[wa-call-media] call media arrangement",
  )

  try {
    await whatsappCallLifecycleService.markRecordingArrangement({
      id: input.whatsappCallId,
      recordingRequested: input.recordingRequested,
      recordingFailureReason: rejectedByMeta
        ? META_RECORDING_ANNOUNCEMENT_REJECTED
        : null,
    })
  } catch (error) {
    logger.error(
      { err: error, whatsappCallId: input.whatsappCallId },
      "WhatsApp call: failed to store the call's recording arrangement",
    )
  }

  if (!rejectedByMeta) {
    return
  }

  logger.error(
    { err: input.announcementError, whatsappCallId: input.whatsappCallId },
    "WhatsApp call: Meta refused the recording announcement — this call is NOT recorded",
  )
  try {
    await logProviderErrorForChannel(channelTypes.enum.whatsapp, {
      workspaceId: input.workspaceId,
      error: input.announcementError,
    })
  } catch (error) {
    logger.error(
      { err: error, whatsappCallId: input.whatsappCallId },
      "WhatsApp call: failed to log the recording refusal for the workspace",
    )
  }
}
