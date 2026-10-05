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
      firstName: z
        .string()
        .optional()
        .describe(
          "Contact first name; used when the contact is first created.",
        ),
      lastName: z
        .string()
        .optional()
        .describe("Contact last name; used when the contact is first created."),
      email: z.email().optional().describe("Contact email address."),
      phoneNumber: z
        .string()
        .optional()
        .describe(
          "Contact phone number, preferably in E.164 format, e.g. `+84901234567`.",
        ),
      avatar: z
        .url()
        .optional()
        .describe("Public https URL of the contact's profile picture."),
      locale: z
        .string()
        .optional()
        .describe("Contact language/locale tag, e.g. `en` or `vi-VN`."),
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
      text: z
        .string()
        .nullish()
        .describe(
          "Message text from the contact. Omit for attachment-only or location messages.",
        ),
      attachments: z
        .array(
          z.object({
            url: z.url().describe("Publicly reachable https URL of the file."),
            fileType: fileTypes.describe(
              "Broad kind of the file: `image`, `audio`, `video` or `file`.",
            ),
            mimeType: z
              .string()
              .describe(
                "File MIME type, e.g. `image/jpeg` or `application/pdf`.",
              ),
            name: z
              .string()
              .optional()
              .describe("File name shown in the inbox."),
          }),
        )
        .optional()
        .describe("Files sent with the message."),
      contentType: z
        .enum(["text", "location"])
        .default("text")
        .describe(
          "`text` (default) for ordinary messages, or `location` for a shared location, which needs `latitude` and `longitude` in `contentAttributes`.",
        ),
      contentAttributes: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Extra attributes for the message. For `contentType` `location`, set `latitude` and `longitude` (decimal degrees).",
        ),
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
