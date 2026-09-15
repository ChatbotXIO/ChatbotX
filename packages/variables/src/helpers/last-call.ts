import { callRecordingService } from "@chatbotx.io/business"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { logger } from "../logger"

/**
 * Presigned URL of the contact's most recent WhatsApp call recording.
 * Recording objects are private, so this is never a public storage URL —
 * the link is only valid for 15 minutes (matches
 * `RECORDING_SIGNED_URL_TTL_SECONDS` in
 * `packages/business/src/whatsapp-call/call-recording-service.ts`), so a
 * consumer that caches `{{last_call_recording}}` past that window must
 * re-resolve the variable rather than reuse the URL.
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
