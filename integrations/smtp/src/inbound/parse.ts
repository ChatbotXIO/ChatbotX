import { type AddressObject, type ParsedMail, simpleParser } from "mailparser"
import { logger } from "../lib/logger"
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_EMAIL,
  MAX_REFERENCES,
  MAX_STORED_HTML_CHARS,
} from "./constants"
import { stripQuotedReply } from "./quoted-reply"

export type ParsedAttachment = {
  filename?: string
  contentType: string
  size: number
  content: Buffer
}

export type ParsedInboundEmail = {
  messageId: string
  inReplyTo?: string
  references: string[]
  subject: string
  fromAddress: string
  fromName?: string
  to: string[]
  cc: string[]
  /** Reply text with quoted history removed. */
  text: string
  /** Complete text, quoted history included. */
  fullText: string
  html?: string
  attachments: ParsedAttachment[]
  /** Auto-responder, mailing-list or bounce: must never open a conversation or be answered. */
  isAutomated: boolean
}

const AUTOMATED_PRECEDENCE = new Set(["bulk", "junk", "auto_reply", "list"])
const BOUNCE_LOCAL_PARTS = new Set(["mailer-daemon", "postmaster"])

const headerText = (mail: ParsedMail, name: string): string | undefined => {
  const value = mail.headers.get(name)
  return typeof value === "string" ? value.trim().toLowerCase() : undefined
}

const toList = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

const addressesOf = (field: AddressObject | AddressObject[] | undefined) =>
  toList(field)
    .flatMap((group) => group.value)
    .map((entry) => entry.address?.trim().toLowerCase())
    .filter((address): address is string => Boolean(address))

export const isAutomatedMail = (
  mail: ParsedMail,
  fromAddress: string,
): boolean => {
  const autoSubmitted = headerText(mail, "auto-submitted")
  if (autoSubmitted && autoSubmitted !== "no") {
    return true
  }
  const precedence = headerText(mail, "precedence")
  if (precedence && AUTOMATED_PRECEDENCE.has(precedence)) {
    return true
  }
  if (headerText(mail, "x-auto-response-suppress")) {
    return true
  }
  // mailparser folds every `List-*` header into a single `list` entry, so the
  // raw header lines are the only place `List-Id` is still visible.
  if (mail.headerLines.some((line) => line.key === "list-id")) {
    return true
  }
  const localPart = fromAddress.split("@")[0] ?? ""
  return BOUNCE_LOCAL_PARTS.has(localPart)
}

const referencesOf = (mail: ParsedMail): string[] =>
  toList(mail.references).slice(-MAX_REFERENCES)

const sha256Hex = async (raw: Buffer): Promise<string> => {
  // Web Crypto, not `node:crypto`: this module is reachable from the builder's
  // Edge-traced router graph via the integration index (AGENTS.md invariant 25).
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(raw),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/**
 * The customer files worth storing. Anything dropped for size or count is
 * logged with the counts: the mail itself is still imported.
 */
const selectAttachments = (
  mail: ParsedMail,
  fromAddress: string,
): ParsedAttachment[] => {
  // Inline images (signature logos, tracking pixels) are not customer files.
  const files = mail.attachments.filter((attachment) => !attachment.related)
  const withinSize = files.filter(
    (attachment) => attachment.size <= MAX_ATTACHMENT_BYTES,
  )
  const kept = withinSize.slice(0, MAX_ATTACHMENTS_PER_EMAIL)
  const oversized = files.length - withinSize.length
  const overCount = withinSize.length - kept.length
  if (oversized > 0 || overCount > 0) {
    logger.warn(
      { messageId: mail.messageId, fromAddress, oversized, overCount },
      "Dropped inbound email attachments over the size or count cap",
    )
  }
  return kept.map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    content: attachment.content,
  }))
}

/** Parses a raw RFC 5322 message. Returns `null` when it has no usable sender. */
export const parseRawEmail = async (
  raw: Buffer,
): Promise<ParsedInboundEmail | null> => {
  const mail = await simpleParser(raw)
  const fromEntry = mail.from?.value[0]
  const fromAddress = fromEntry?.address?.trim().toLowerCase()
  if (!fromAddress) {
    return null
  }

  const attachments = selectAttachments(mail, fromAddress)

  const fullText = (mail.text ?? "").trim()
  const html = typeof mail.html === "string" ? mail.html : undefined

  return {
    messageId: mail.messageId ?? `<${await sha256Hex(raw)}@generated.invalid>`,
    inReplyTo: mail.inReplyTo,
    references: referencesOf(mail),
    subject: mail.subject ?? "",
    fromAddress,
    fromName: fromEntry?.name?.trim() || undefined,
    to: addressesOf(mail.to),
    cc: addressesOf(mail.cc),
    text: stripQuotedReply(fullText),
    fullText,
    html: html?.slice(0, MAX_STORED_HTML_CHARS),
    attachments,
    isAutomated: isAutomatedMail(mail, fromAddress),
  }
}
