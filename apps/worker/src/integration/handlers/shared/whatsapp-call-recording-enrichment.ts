import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { enrichCallActivityMessage } from "./whatsapp-call-finalize"

/**
 * Stamps `hasTranscript: true` on the finalize message; transcript
 * text/segments are fetched separately on Call Information sheet open, never
 * put on the message. Shared by browserWhisper and Meta-native transcription
 * paths; kept in its own module so importing it doesn't pull in
 * `whatsapp-call-transcribe.ts`'s browserWhisper-only AI deps (`ai`, `ky`,
 * `@chatbotx.io/ai`).
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
