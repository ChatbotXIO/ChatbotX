/** The two per-number call media toggles stored on `IntegrationWhatsapp`. */
export type WhatsappCallMediaToggles = {
  callRecordingEnabled: boolean
  callTranscriptionEnabled: boolean
}

/**
 * Whether a WhatsApp number transcribes its calls. Transcription only runs on
 * a number that also records calls: Meta itself could transcribe a call it
 * does not record, but a transcript with no recording behind it cannot be
 * checked against the audio, so the product ties the two together. Every
 * place that decides whether to transcribe reads it through here, so a stored
 * `callTranscriptionEnabled` left on while recording is off stays inert.
 */
export const transcribesCalls = (toggles: WhatsappCallMediaToggles): boolean =>
  toggles.callRecordingEnabled && toggles.callTranscriptionEnabled
