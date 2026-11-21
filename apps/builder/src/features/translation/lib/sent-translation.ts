import { z } from "zod"
import { translationNotSentDataSchema } from "../schema/errors"
import { messageTranslationResource } from "../schema/resource"

const sentMessageSchema = z.object({
  id: z.string(),
  translation: messageTranslationResource.optional(),
})

const notSentSchema = z.object({
  translationNotSent: translationNotSentDataSchema,
})

export type SentTranslation =
  | {
      kind: "sent"
      messageId: string
      translation: NonNullable<
        z.infer<typeof messageTranslationResource>
      > | null
    }
  | {
      /** Nothing was sent: the text could not be translated. */
      kind: "notSent"
      /** The AI provider failed, so translation is now off for the conversation. */
      turnedOff: boolean
    }

/** What the send action returned about translation; `null` when it carried none. */
export function readSentTranslation(data: unknown): SentTranslation | null {
  const notSent = notSentSchema.safeParse(data)
  if (notSent.success) {
    return {
      kind: "notSent",
      turnedOff:
        notSent.data.translationNotSent.conversationTranslation === "off",
    }
  }
  const parsed = sentMessageSchema.safeParse(data)
  if (!parsed.success) {
    return null
  }
  return {
    kind: "sent",
    messageId: parsed.data.id,
    translation: parsed.data.translation ?? null,
  }
}
