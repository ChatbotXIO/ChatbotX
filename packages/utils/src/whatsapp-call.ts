/** The two per-number call media toggles stored on `IntegrationWhatsapp`. */
export type WhatsappCallMediaToggles = {
  callRecordingEnabled: boolean
  callTranscriptionEnabled: boolean
}

/**
 * Transcription only runs when recording is also on: a transcript with no
 * recording behind it can't be checked against the audio, so a stored
 * `callTranscriptionEnabled` left on while recording is off stays inert.
 */
export const transcribesCalls = (toggles: WhatsappCallMediaToggles): boolean =>
  toggles.callRecordingEnabled && toggles.callTranscriptionEnabled
