import { callRecordingService } from "@chatbotx.io/business"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { logger } from "../logger"

/**
 * Presigned URL of the contact's most recent WhatsApp call recording. Never a public storage
 * URL — valid for only 15 minutes (RECORDING_SIGNED_URL_TTL_SECONDS), so a consumer caching
 * `{{last_call_recording}}` past that window must re-resolve rather than reuse it.
 */
export const getContactLastCallRecording = async (
  contactId: string,
): Promise<string | null> => {
  const call =
    await whatsappCallRepository.findLatestRecordedByContactId(contactId)
  if (!call?.recordingPath) {
    return null
  }
  try {
    return await callRecordingService.getRecordingSignedUrl({
      recordingPath: call.recordingPath,
    })
  } catch (err) {
    // Presigning talks to object storage, so it can fail transiently. This
    // variable is rendered inside flows/broadcasts/templates — throwing would
    // abort the whole render, so a failure degrades to a blank variable
    // (identical to "no recording") and stays observable in the logs.
    logger.error(
      { err, contactId, whatsappCallId: call.id },
      "Failed to presign the contact's last call recording",
    )
    return null
  }
}

/** Transcript text of the contact's most recent transcribed WhatsApp call. */
export const getContactLastCallTranscript = async (
  contactId: string,
): Promise<string | null> => {
  const call =
    await whatsappCallRepository.findLatestTranscribedByContactId(contactId)
  return call?.transcript ?? null
}
