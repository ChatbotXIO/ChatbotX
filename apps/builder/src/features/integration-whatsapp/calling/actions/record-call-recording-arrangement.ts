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
 * Writes what a call actually arranged for recording, so the conversation card
 * reports the truth instead of the number's general setting.
 *
 * Meta records a call only after playing its consent announcement, and refuses
 * that announcement outright when the configured purpose or language is
 * invalid. The refusal used to be one warn line while the call went ahead
 * unrecorded — for a workspace that records calls to meet an obligation, that
 * has to be impossible to miss, so it also lands in the workspace error log.
 *
 * Never throws: bookkeeping must not fail a call that is already connected.
 */
export async function recordCallRecordingArrangement(input: {
  whatsappCallId: string
  workspaceId: string
  /** Whether a recording is actually coming for this call. */
  recordingRequested: boolean
  /** Whether this call asked Meta to record in the first place. */
  recordingWasRequested: boolean
  /** Meta's refusal, when the announcement was dropped to save the call. */
  announcementError?: unknown
}): Promise<void> {
  const rejectedByMeta =
    input.recordingWasRequested && !input.recordingRequested

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
