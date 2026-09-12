import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { toPublicStorageUrl } from "./storage-url"

/** Public URL of the contact's most recent WhatsApp call recording. */
export const getContactLastCallRecording = async (
  contactId: string,
): Promise<string | null> => {
  const call =
    await whatsappCallRepository.findLatestRecordedByContactId(contactId)
  if (!call?.recordingPath) {
    return null
  }
  return await toPublicStorageUrl(call.recordingPath, call.workspaceId)
}

/** Transcript text of the contact's most recent transcribed WhatsApp call. */
export const getContactLastCallTranscript = async (
  contactId: string,
): Promise<string | null> => {
  const call =
    await whatsappCallRepository.findLatestTranscribedByContactId(contactId)
  return call?.transcript ?? null
}
