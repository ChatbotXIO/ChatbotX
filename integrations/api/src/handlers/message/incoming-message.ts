import {
  contentTypes,
  fileTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { z } from "zod"

/**
 * Inbound payload shape accepted at `POST /v1/channels/api/messages`. Kept
 * here (not just at the builder route) so the worker-side handler can
 * re-validate the payload it receives off the queue, independent of the
 * builder's own request validation.
 */
export const incomingApiMessageSchema = z.object({
  contact: z
    .object({
      sourceId: z
        .string()
        .min(1)
        .describe(
          "Stable contact id in your system; used to find or create the contact.",
        ),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.email().optional(),
      phoneNumber: z.string().optional(),
      avatar: z.url().optional(),
      locale: z.string().optional(),
    })
    .describe(
      "Contact the message is from, identified by your system's own id.",
    ),
  message: z
    .object({
      sourceId: z
        .string()
        .min(1)
        .describe(
          "Idempotency key: resending the same value for the same contact does not duplicate the message.",
        ),
      text: z.string().nullish(),
      attachments: z
        .array(
          z.object({
            url: z.url(),
            fileType: fileTypes,
            mimeType: z.string(),
            name: z.string().optional(),
          }),
        )
        .optional(),
      contentType: z.enum(["text", "location"]).default("text"),
      contentAttributes: z.record(z.string(), z.unknown()).optional(),
    })
    .describe("Message body and any attachments."),
  postbackPayload: z
    .string()
    .nullish()
    .describe(
      "Payload echoed back when the message is a reply to a button/postback.",
    ),
})
export type IncomingApiMessage = z.infer<typeof incomingApiMessageSchema>

export const receiveMessage = ({
  data,
}: {
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const validated = incomingApiMessageSchema.parse(data.payload)

  const contact: IncomingContact = {
    sourceId: validated.contact.sourceId,
    firstName: validated.contact.firstName,
    lastName: validated.contact.lastName,
    email: validated.contact.email,
    phoneNumber: validated.contact.phoneNumber,
    avatar: validated.contact.avatar,
    locale: validated.contact.locale,
  }

  const attachments: IncomingAttachment[] = (
    validated.message.attachments ?? []
  ).map((attachment) => ({
    sourceId: attachment.url,
    fileType: attachment.fileType,
    mimeType: attachment.mimeType,
    originPath: attachment.url,
    size: 0,
    url: attachment.url,
    name: attachment.name,
  }))

  const message: IncomingMessage = {
    sourceId: validated.message.sourceId,
    messageType: messageTypes.enum.incoming,
    contentType:
      validated.message.contentType === "location"
        ? contentTypes.enum.location
        : contentTypes.enum.text,
    text: validated.message.text ?? undefined,
    contentAttributes: validated.message.contentAttributes,
    attachments,
  }

  return Promise.resolve({
    message,
    contact,
    postbackAction: validated.postbackPayload ?? null,
    quickReplyAction: null,
    ref: null,
  })
}
