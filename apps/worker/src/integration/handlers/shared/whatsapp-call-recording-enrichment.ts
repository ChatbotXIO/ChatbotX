import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { enrichCallActivityMessage } from "./whatsapp-call-finalize"

/**
 * Enriches the single progressive `whatsapp_call` finalize message
 * (`enrichCallActivityMessage`) with `hasTranscript: true` once a transcript
 * has been stamped on the `WhatsappCall` row. The transcript TEXT/segments
 * themselves never go on the message — only the flag —
 * they are fetched separately on Call Information sheet open.
 *
 * Shared by both the SIP/Whisper (`handleWhatsappCallTranscribe`) and
 * Meta-native (`handleWhatsappCallNativeTranscriptFetch`) transcription
 * paths so neither keeps its own copy of the enrichment call. Kept in its
 * own module (rather than inline in `whatsapp-call-transcribe.ts`) so
 * importing it does not pull in that file's SIP-only AI-transcription
 * dependencies (`ai`, `ky`, `@chatbotx.io/ai`).
 */
export const enrichRecordingMessageWithTranscript = async (props: {
  call: Pick<
    WhatsappCallModel,
    "id" | "conversationId" | "workspaceId" | "direction" | "createdAt"
  >
}): Promise<void> => {
  await enrichCallActivityMessage({
    call: props.call,
    overrides: { hasTranscript: true },
  })
}
