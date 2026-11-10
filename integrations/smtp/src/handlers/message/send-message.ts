import { type MessageHandlers, SdkException } from "@chatbotx.io/sdk"
import nodemailer from "nodemailer"
import type { SmtpAuthValue } from "../../schema"
import {
  buildReplySubject,
  buildThreadHeaders,
  generateMessageId,
  readThreadAttributes,
  textToHtml,
} from "./email-headers"

export const readFromAddress = (detail: unknown): string | undefined => {
  if (typeof detail !== "object" || detail === null) {
    return
  }
  const value = (detail as { fromAddress?: unknown }).fromAddress
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined
}

export type SmtpOutgoingMail = {
  to: string
  subject: string
  text: string
  attachmentUrls?: { url: string; filename?: string }[]
  inReplyTo?: string
  references?: string[]
}

export const deliverMail = async (props: {
  auth: SmtpAuthValue
  fromAddress: string
  mail: SmtpOutgoingMail
}): Promise<string> => {
  const { auth, fromAddress, mail } = props
  const messageId = generateMessageId(fromAddress)

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

    const thread = readThreadAttributes(message.contentAttributes)
    const messageId = await deliverMail({
      auth: ctx.auth,
      fromAddress,
      mail: {
        to: contact.sourceId,
        subject: buildReplySubject(thread.subject),
        text: text || " ",
        attachmentUrls: attachments.map((attachment) => ({
          url: attachment.url as string,
        })),
        ...buildThreadHeaders(thread),
      },
    })

    return { messageIds: [messageId], sentCount: 1 }
  }
