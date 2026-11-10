import { type HandleRequestProps, SdkException } from "@chatbotx.io/sdk"
import nodemailer from "nodemailer"
import { logger } from "../lib/logger"
import type { InboundWebhookProvider } from "../schema"
import { MAX_RAW_SOURCE_BYTES } from "./constants"

/**
 * Inbound-parse webhooks: a relay provider (SendGrid, Mailgun, Postmark,
 * Brevo) POSTs each received mail to a tokenised URL. Every adapter yields the
 * raw RFC 5322 source, so the worker parses webhook mail exactly like IMAP mail.
 * Raw delivery is preferred; when a provider only sends parsed fields, a mail
 * is rebuilt from them (attachments are then only kept for Postmark).
 */

export type SmtpWebhookConfig = {
  inboxId: string
  provider: InboundWebhookProvider
}

/** Refuse to buffer an absurd request; larger than a capped raw mail + framing. */
const MAX_REQUEST_BYTES = MAX_RAW_SOURCE_BYTES * 3
/** Mails accepted from one request (Brevo batches several per POST). */
const MAX_MAILS_PER_REQUEST = 50
const HEADER_END = /\r?\n\r?\n/
const UNFOLD = /\r?\n[ \t]+/g
const LINE_BREAK = /\r?\n/
const HEADER_LINE = /^([!-9;-~]+):[ \t]*(.*)$/
const MESSAGE_ID_HEADER = /^message-id:[ \t]*(.+)$/im
const JOB_KEY_LENGTH = 32

type HeaderMap = Map<string, string>
type RawPart = string | File | null | undefined

type MailFields = {
  from?: string
  to?: string
  subject?: string
  text?: string
  html?: string
  headers: HeaderMap
  attachments?: { filename?: string; content: Buffer; contentType?: string }[]
}

const badRequest = (message: string): SdkException =>
  new SdkException(message, "SMTP_WEBHOOK_INVALID", 400)

const tooLarge = (): SdkException =>
  new SdkException(
    "Inbound webhook body is too large",
    "SMTP_WEBHOOK_TOO_LARGE",
    413,
  )

/**
 * Buffers the body up to the cap, whatever `Content-Length` claims (it is
 * absent on chunked requests), and returns an equivalent request the adapters
 * can parse. Aborts as soon as the cap is crossed.
 */
const readCappedRequest = async (req: Request): Promise<Request> => {
  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_REQUEST_BYTES) {
    throw tooLarge()
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = req.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const headers = new Headers(req.headers)
  headers.delete("content-length")
  return new Request(req.url, {
    method: req.method,
    headers,
    body: Buffer.concat(chunks),
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

const sha256Hex = async (input: string | Uint8Array): Promise<string> => {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** `Name: value` lines (folded lines joined) into a lowercase-keyed map; first occurrence wins. */
export const parseHeaderBlock = (block: string): HeaderMap => {
  const headers: HeaderMap = new Map()
  for (const line of block.replace(UNFOLD, " ").split(LINE_BREAK)) {
    const match = HEADER_LINE.exec(line)
    const name = match?.[1]?.toLowerCase()
    if (name && !headers.has(name)) {
      headers.set(name, (match?.[2] ?? "").trim())
    }
  }
  return headers
}

const headersFromPairs = (pairs: [unknown, unknown][]): HeaderMap => {
  const headers: HeaderMap = new Map()
  for (const [name, value] of pairs) {
    if (typeof name === "string" && typeof value === "string") {
      const key = name.toLowerCase()
      if (!headers.has(key)) {
        headers.set(key, value.trim())
      }
    }
  }
  return headers
}

const readPart = async (part: RawPart): Promise<string | undefined> => {
  if (typeof part === "string") {
    return text(part)
  }
  return part ? text(await part.text()) : undefined
}

const PASSTHROUGH_HEADERS = [
  "auto-submitted",
  "precedence",
  "x-auto-response-suppress",
  "list-id",
]

/** Rebuilds a mail from provider-parsed fields, keeping the headers loop protection depends on. */
const composeRaw = async (fields: MailFields): Promise<Buffer> => {
  const { headers } = fields
  if (!fields.from) {
    throw badRequest("Inbound mail has no sender")
  }
  // A synthetic id keeps provider retries of the same mail deduplicable.
  const messageId =
    headers.get("message-id") ??
    `<${(await sha256Hex(`${fields.from}|${fields.to}|${fields.subject}|${fields.text}`)).slice(0, JOB_KEY_LENGTH)}@inbound.invalid>`
  const passthrough = Object.fromEntries(
    PASSTHROUGH_HEADERS.flatMap((name) => {
      const value = headers.get(name)
      return value ? [[name, value]] : []
    }),
  )
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  })
  const info = await transport.sendMail({
    from: fields.from,
    to: fields.to ?? "inbound@inbound.invalid",
    subject: fields.subject ?? "",
    text: fields.text,
    html: fields.html,
    messageId,
    inReplyTo: headers.get("in-reply-to"),
    references: headers.get("references"),
    headers: passthrough,
    attachments: fields.attachments,
  })
  return info.message as Buffer
}

const rawOrCompose = async (
  raw: string | undefined,
  fields: MailFields,
): Promise<Buffer> => (raw ? Buffer.from(raw) : await composeRaw(fields))

const fromSendgrid = async (req: Request): Promise<Buffer[]> => {
  const form = await req.formData()
  const get = (key: string) => readPart(form.get(key))
  const headerBlock = (await get("headers")) ?? ""
  return [
    await rawOrCompose(await get("email"), {
      from: await get("from"),
      to: await get("to"),
      subject: await get("subject"),
      text: await get("text"),
      html: await get("html"),
      headers: parseHeaderBlock(headerBlock),
    }),
  ]
}

const parseMailgunHeaders = (value: string | undefined): HeaderMap => {
  if (!value) {
    return new Map()
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? headersFromPairs(
          parsed.filter(Array.isArray).map((pair) => [pair[0], pair[1]]),
        )
      : new Map()
  } catch {
    return new Map()
  }
}

const fromMailgun = async (req: Request): Promise<Buffer[]> => {
  const form = await req.formData()
  const get = (key: string) => readPart(form.get(key))
  return [
    await rawOrCompose(await get("body-mime"), {
      from: await get("from"),
      to: (await get("To")) ?? (await get("recipient")),
      subject: await get("subject"),
      text: await get("body-plain"),
      html: await get("body-html"),
      headers: parseMailgunHeaders(await get("message-headers")),
    }),
  ]
}

const readJson = async (req: Request): Promise<Record<string, unknown>> => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw badRequest("Inbound webhook body is not valid JSON")
  }
  if (!isRecord(body)) {
    throw badRequest("Inbound webhook body must be a JSON object")
  }
  return body
}

const postmarkAttachments = (value: unknown): MailFields["attachments"] =>
  Array.isArray(value)
    ? value.filter(isRecord).flatMap((entry) => {
        const content = text(entry.Content)
        return content
          ? [
              {
                filename: text(entry.Name),
                contentType: text(entry.ContentType),
                content: Buffer.from(content, "base64"),
              },
            ]
          : []
      })
    : undefined

const fromPostmark = async (req: Request): Promise<Buffer[]> => {
  const body = await readJson(req)
  const headers = headersFromPairs(
    Array.isArray(body.Headers)
      ? body.Headers.filter(isRecord).map((h) => [h.Name, h.Value])
      : [],
  )
  return [
    await rawOrCompose(text(body.RawEmail), {
      from: text(body.From),
      to: text(body.To),
      subject: text(body.Subject),
      text: text(body.TextBody),
      html: text(body.HtmlBody),
      headers,
      attachments: postmarkAttachments(body.Attachments),
    }),
  ]
}

const brevoAddress = (value: unknown): string | undefined => {
  const entry = Array.isArray(value) ? value[0] : value
  if (!isRecord(entry)) {
    return
  }
  const address = text(entry.Address)
  const name = text(entry.Name)
  return address && name
    ? `"${name.replaceAll('"', "")}" <${address}>`
    : address
}

const brevoHeaders = (value: unknown): HeaderMap =>
  isRecord(value)
    ? headersFromPairs(
        Object.entries(value).map(([name, entry]) => [
          name,
          Array.isArray(entry) ? entry[0] : entry,
        ]),
      )
    : new Map()

const fromBrevo = async (req: Request): Promise<Buffer[]> => {
  const body = await readJson(req)
  const items = Array.isArray(body.items) ? body.items.filter(isRecord) : []
  if (items.length > MAX_MAILS_PER_REQUEST) {
    throw tooLarge()
  }
  const mails: Buffer[] = []
  for (const item of items) {
    const headers = brevoHeaders(item.Headers)
    const messageId = text(item.MessageId)
    if (messageId && !headers.has("message-id")) {
      headers.set("message-id", messageId)
    }
    const inReplyTo = text(item.InReplyTo)
    if (inReplyTo && !headers.has("in-reply-to")) {
      headers.set("in-reply-to", inReplyTo)
    }
    mails.push(
      await composeRaw({
        from: brevoAddress(item.From),
        to: brevoAddress(item.To),
        subject: text(item.Subject),
        text: text(item.RawTextBody),
        html: text(item.RawHtmlBody),
        headers,
      }),
    )
  }
  return mails
}

const ADAPTERS: Record<
  InboundWebhookProvider,
  (req: Request) => Promise<Buffer[]>
> = {
  sendgrid: fromSendgrid,
  mailgun: fromMailgun,
  postmark: fromPostmark,
  brevo: fromBrevo,
}

/** Raw RFC 5322 sources carried by one webhook request. */
export const extractRawEmails = async (
  provider: InboundWebhookProvider,
  req: Request,
): Promise<Buffer[]> => await ADAPTERS[provider](await readCappedRequest(req))

/** Stable per-mail key: the Message-ID when present, else the whole source. */
export const mailDedupKey = async (raw: Buffer): Promise<string> => {
  const headerSection = raw.toString("utf8", 0, 64 * 1024).split(HEADER_END)[0]
  const messageId = MESSAGE_ID_HEADER.exec(
    headerSection?.replace(UNFOLD, " ") ?? "",
  )?.[1]
  const digest = await sha256Hex(messageId?.trim() ?? new Uint8Array(raw))
  return digest.slice(0, JOB_KEY_LENGTH)
}

export const handleInboundWebhook = async (
  props: HandleRequestProps<SmtpWebhookConfig>,
): Promise<string> => {
  const { req, config, queue } = props
  const mails = await extractRawEmails(config.provider, req)

  for (const raw of mails) {
    if (raw.length > MAX_RAW_SOURCE_BYTES) {
      // Acknowledge: a provider retry of an oversized mail can never succeed.
      logger.warn(
        { inboxId: config.inboxId, bytes: raw.length },
        "Dropping oversized inbound webhook email",
      )
      continue
    }
    await queue?.add(
      "incomingMessage",
      {
        type: "incomingMessage",
        data: {
          integrationType: "smtp",
          integrationIdentifier: config.inboxId,
          payload: { raw: raw.toString("base64") },
        },
      },
      {
        // Colon-free (Redis key separator); a provider retry reuses the id.
        jobId: `smtp-in-${config.inboxId}-wh-${await mailDedupKey(raw)}`,
        removeOnComplete: { age: 24 * 3600 },
      },
    )
  }
  return "ok"
}
