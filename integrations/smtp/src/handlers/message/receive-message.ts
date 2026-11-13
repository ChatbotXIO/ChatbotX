import {
  type Context,
  contentTypes,
  getMediaStoragePrefix,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  storeIncomingImage,
  toStoredMediaFields,
} from "@chatbotx.io/utils/store-incoming-image"
import { z } from "zod"
import { type ParsedInboundEmail, parseRawEmail } from "../../inbound/parse"
import { logger } from "../../lib/logger"
import type { SmtpAuthValue } from "../../schema"
import { extractEmailAddress } from "./email-headers"
import { readFromAddress } from "./send-message"

/** Queue payload for one inbound mail: the raw RFC 5322 source, base64. */
export const smtpInboundPayloadSchema = z.object({
  raw: z.string().min(1),
})
export type SmtpInboundPayload = z.infer<typeof smtpInboundPayloadSchema>

const WHITESPACE = /\s+/

const splitDisplayName = (
  name: string | undefined,
): Pick<IncomingContact, "firstName" | "lastName"> => {
  if (!name) {
    return {}
  }
  const [firstName, ...rest] = name.split(WHITESPACE)
  return { firstName, lastName: rest.join(" ") || undefined }
}

const storeAttachments = async (
  ctx: Context<SmtpAuthValue>,
  email: ParsedInboundEmail,
): Promise<IncomingAttachment[]> => {
  const stored: IncomingAttachment[] = []
  for (const attachment of email.attachments) {
    try {
      const bytes = new Uint8Array(attachment.content).buffer
      const result = await storeIncomingImage({
        uploader: ctx.uploader,
        key: `${getMediaStoragePrefix(ctx)}/${createId()}`,
        bytes,
        mimeType: attachment.contentType,
        // A mailed image is a file the sender meant to keep: store the original.
        profile: "original",
        acl: "public-read",
      })
      stored.push({
        sourceId: createId(),
        fileType: guessFileTypeFromMimeType(attachment.contentType),
        name: attachment.filename,
        ...toStoredMediaFields(result),
      })
    } catch (error) {
      // One bad attachment must not lose the customer's message.
      logger.warn(
        { err: error, contentType: attachment.contentType },
        "Failed to store inbound email attachment",
      )
    }
  }
  return stored
}

export const receiveMessage: MessageHandlers<SmtpAuthValue>["receiveMessage"] =
  async ({ ctx, data }): Promise<ReceivedMessageResult | null> => {
    const payload = smtpInboundPayloadSchema.parse(data.payload)
    const email = await parseRawEmail(Buffer.from(payload.raw, "base64"))
    if (!email) {
      return null
    }

    // Never open a conversation for auto-responders/bounces, and never ingest
    // our own mail (an IMAP "Sent" copy or a self-addressed message): replying
    // to either would start a mail loop.
    const configuredFrom = readFromAddress(ctx.integrationDetail)
    const ownAddress = configuredFrom
      ? extractEmailAddress(configuredFrom)
      : undefined
    if (email.isAutomated || email.fromAddress === ownAddress) {
      logger.info(
        { messageId: email.messageId, automated: email.isAutomated },
        "Ignoring automated or self-sent inbound email",
      )
      return null
    }

    const incomingMessage: IncomingMessage = {
      sourceId: email.messageId,
      messageType: messageTypes.enum.incoming,
      contentType: contentTypes.enum.text,
      text: email.text,
      attachments: await storeAttachments(ctx, email),
      contentAttributes: {
        email: {
          subject: email.subject,
          messageId: email.messageId,
          inReplyTo: email.inReplyTo,
          references: email.references,
          from: email.fromAddress,
          to: email.to,
          cc: email.cc,
          // Untrusted: kept for reference only, never rendered as HTML.
          html: email.html,
        },
      },
    }

    return {
      message: incomingMessage,
      contact: {
        sourceId: email.fromAddress,
        email: email.fromAddress,
        ...splitDisplayName(email.fromName),
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
    }
  }
