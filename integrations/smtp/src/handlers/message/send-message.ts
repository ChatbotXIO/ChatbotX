import { type MessageHandlers, SdkException } from "@chatbotx.io/sdk"
import { generateMessageId } from "@chatbotx.io/utils"
import nodemailer from "nodemailer"
import type { SmtpAuthValue } from "../../schema"
import {
  buildReplySubject,
  buildThreadHeaders,
  type EmailThreadAttributes,
  extractEmailAddress,
  readThreadAttributes,
  textToHtml,
} from "./email-headers"

export const readFromAddress = (detail: unknown): string | undefined => {
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("fromAddress" in detail) ||
    typeof detail.fromAddress !== "string"
  ) {
    return
  }
  return detail.fromAddress.trim() || undefined
}

export const readEmailConversationMessageId = (
  contact: unknown,
): string | undefined => {
  if (
    typeof contact !== "object" ||
    contact === null ||
    !("sourceConversationId" in contact) ||
    typeof contact.sourceConversationId !== "string" ||
    !contact.sourceConversationId.startsWith("email:")
  ) {
    return
  }
  return contact.sourceConversationId.slice("email:".length)
}

export type SmtpOutgoingMail = {
  to: string
  subject: string
  text: string
  attachmentUrls?: { url: string; filename?: string }[]
  inReplyTo?: string
  messageId?: string
  references?: string[]
}

export const deliverMail = async (props: {
  auth: SmtpAuthValue
  fromAddress: string
  mail: SmtpOutgoingMail
}): Promise<string> => {
  const { auth, fromAddress, mail } = props
  const domain = extractEmailAddress(fromAddress).split("@")[1] || "localhost"
  const messageId = mail.messageId ?? generateMessageId(domain)

  const transporter = nodemailer.createTransport({
    host: auth.host,
    port: auth.port,
    secure: auth.port === 465,
    auth: { user: auth.username, pass: auth.password },
  })

  await transporter.sendMail({
    from: fromAddress,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: textToHtml(mail.text),
    messageId,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    attachments: mail.attachmentUrls?.map(({ url, filename }) => ({
      path: url,
      filename,
    })),
  })

  return messageId
}

export const sendThreadedMail = async (props: {
  auth: SmtpAuthValue
  fromAddress: string
  to: string
  text: string
  attachmentUrls?: { url: string; filename?: string }[]
  parent?: EmailThreadAttributes
  subject?: string
  outgoingMessageId?: string
}) => {
  const parent = props.parent ?? {}
  const subject = props.subject ?? buildReplySubject(parent.subject)
  const headers = buildThreadHeaders(parent)
  const messageId = await deliverMail({
    auth: props.auth,
    fromAddress: props.fromAddress,
    mail: {
      to: props.to,
      subject,
      text: props.text,
      attachmentUrls: props.attachmentUrls,
      messageId: props.outgoingMessageId,
      ...headers,
    },
  })
  return { messageId, subject, ...headers }
}

export const sendMessage: MessageHandlers<SmtpAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    const fromAddress = readFromAddress(ctx.integrationDetail)
    if (!fromAddress) {
      throw new SdkException("SMTP inbox has no from address configured")
    }
    if (!contact.sourceId.includes("@")) {
      throw new SdkException("Contact has no email address to send to")
    }

    const text = message.text?.trim() ?? ""
    const attachments = (message.attachments ?? []).filter(
      (attachment) => typeof attachment.url === "string" && attachment.url,
    )
    if (!text && attachments.length === 0) {
      return { messageIds: [], sentCount: 0 }
    }

    const parent = readThreadAttributes(message.contentAttributes)
    const delivered = await sendThreadedMail({
      auth: ctx.auth,
      fromAddress,
      to: contact.sourceId,
      text: text || " ",
      attachmentUrls: attachments.map((attachment) => ({
        url: attachment.url as string,
      })),
      parent,
      outgoingMessageId:
        parent.messageId || parent.inReplyTo
          ? undefined
          : readEmailConversationMessageId(contact),
    })

    return {
      messageIds: [delivered.messageId],
      sentCount: 1,
      email: delivered,
    }
  }
