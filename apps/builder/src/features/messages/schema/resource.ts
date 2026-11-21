import { createSelectSchema, messageModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { attachmentResource } from "@/features/attachments/schema/resource"
import { contactResource } from "@/features/contacts/schema/resource"
import { translationApiErrorCodes } from "@/features/translation/schema/errors"
import { messageTranslationResource } from "@/features/translation/schema/resource"
import { userResource } from "@/features/users/schema/resource"

export const messageResource = createSelectSchema(messageModel, {
  id: z.string(),
  conversationId: z.string(),
  workspaceId: z.string(),
  contactInboxId: z.string(),
  // `z.coerce.date()` accepts a real `Date` (every server-side caller
  // selecting straight from the DB) exactly like `z.date()` would, but also
  // accepts the ISO string a `Date` becomes after a JSON.stringify/parse
  // round trip — e.g. a realtime `messageCreated` wire frame. Without this,
  // parsing that wire payload against this schema rejects every message.
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).and(
  z.object({
    clientId: zodBigintAsString().optional(),
  }),
)
export type MessageResource = z.infer<typeof messageResource>

export const messageResourceWithRelations = messageResource.and(
  z.object({
    attachmentCount: z.number().optional(),
    attachments: z.array(attachmentResource).optional(),
    user: userResource.optional(),
    contact: contactResource.optional(),
    clientId: zodBigintAsString().optional(),
    translation: messageTranslationResource
      .optional()
      .describe(
        "Inbox translation of this message, `null` when it has none. Inbound: `displayText` is the customer's message translated into the workspace language (request it with `translation.requestMessages`). Outbound: `displayText` is the sentence the agent wrote; `text` is what the customer received.",
      ),
    translationFallback: z
      .object({ reason: translationApiErrorCodes })
      .nullable()
      .optional()
      .describe(
        "Only on the response to a send with `translate: true`: why the text was sent as written (translation off for the conversation, or the customer's language unknown). A failed translation is never sent; it fails with `translationNotSent`.",
      ),
    editedTranslationDiscarded: z
      .boolean()
      .optional()
      .describe(
        "Only on the response to a send with `editedTranslation`: true when it was discarded because the conversation's language changed.",
      ),
  }),
)
export type MessageResourceWithRelations = z.infer<
  typeof messageResourceWithRelations
>
