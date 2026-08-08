import { extractContactInfo } from "@chatbotx.io/business"
import {
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
} from "@chatbotx.io/sdk"
import type { HistoricalMessage } from "./bulk-historical-import"
import type { AppUsageSignal } from "./pull-adapter"

// Canonical Meta Graph messaging shapes shared by both Instagram coexist
// providers: native Instagram Login (`type: "instagram"`) and Instagram-via-
// Facebook (`type: "facebook"`). Both return the identical Graph message
// contract, so the normalization lives here once and each provider adapter only
// owns its pull source (which client/endpoint/token) and context loading.

export type GraphParticipant = {
  id: string
  username?: string
  name?: string
}

export type GraphAttachment = {
  id?: string
  type?: string
  payload?: { url?: string }
  image_data?: {
    url?: string
    preview_url?: string
    width?: number
    height?: number
  }
  video_data?: {
    url?: string
    preview_url?: string
    width?: number
    height?: number
  }
  file_url?: string
  name?: string
  mime_type?: string
  size?: number
}

export type GraphHistoryMessage = {
  id: string
  message?: string
  from?: GraphParticipant
  to?: { data?: GraphParticipant[] }
  created_time?: string
  attachments?: { data?: GraphAttachment[] }
  is_unsupported?: boolean
}

export type GraphConversation = {
  id: string
  updated_time?: string
  participants?: { data?: GraphParticipant[] }
}

export type GraphAppUsage = {
  call_count?: number
  total_cputime?: number
  total_time?: number
}

const WHITESPACE_RE = /\s+/

export const splitDisplayName = (
  raw: string | undefined,
): { firstName?: string; lastName?: string } => {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return {}
  }
  const [firstName, ...rest] = trimmed.split(WHITESPACE_RE)
  return {
    firstName,
    lastName: rest.join(" ") || undefined,
  }
}

export const parseInstagramApiDate = (
  value: string | undefined,
): Date | undefined => {
  if (!value) {
    return
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

const toIncomingAttachment = (
  raw: GraphAttachment,
): IncomingAttachment | null => {
  const url =
    raw.payload?.url ??
    raw.image_data?.url ??
    raw.video_data?.url ??
    raw.file_url ??
    null
  if (!url) {
    return null
  }
  const mimeType = raw.mime_type ?? "application/octet-stream"
  const dimensions = raw.image_data ?? raw.video_data
  return {
    sourceId: raw.id ?? url,
    fileType: guessFileTypeFromMimeType(mimeType),
    mimeType,
    originPath: url,
    size: raw.size ?? 0,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    name: raw.name,
  }
}

export const extractAttachments = (
  message: GraphHistoryMessage,
): IncomingAttachment[] => {
  const attachments: IncomingAttachment[] = []
  for (const raw of message.attachments?.data ?? []) {
    const attachment = toIncomingAttachment(raw)
    if (attachment) {
      attachments.push(attachment)
    }
  }
  return attachments
}

export const findCustomerParticipant = (props: {
  participants: GraphParticipant[]
  messages: GraphHistoryMessage[]
  igId: string
}): GraphParticipant | null => {
  const participant = props.participants.find((item) => item.id !== props.igId)
  if (participant) {
    return participant
  }

  for (const message of props.messages) {
    if (message.from && message.from.id !== props.igId) {
      return message.from
    }
    const recipient = message.to?.data?.find((item) => item.id !== props.igId)
    if (recipient) {
      return recipient
    }
  }

  return null
}

export const toIncomingContact = (
  participant: GraphParticipant,
): IncomingContact => {
  const name = splitDisplayName(participant.name ?? participant.username)
  return {
    sourceId: participant.id,
    firstName: name.firstName ?? participant.username ?? participant.id,
    lastName: name.lastName,
  }
}

export const toAppUsageSignal = (
  appUsage: GraphAppUsage | null | undefined,
): AppUsageSignal | null => {
  if (!appUsage) {
    return null
  }
  return {
    kind: "meta-app-usage",
    callCount: appUsage.call_count,
    totalCputime: appUsage.total_cputime,
    totalTime: appUsage.total_time,
  }
}

// Builds a normalized historical message, or null when the message carries no
// text or attachments, or when it falls before the cutoff after the initial
// window. `igId` identifies the business account so direction can be resolved.
export const buildHistoricalMessage = (props: {
  message: GraphHistoryMessage
  igId: string
  cutoff: Date
  totalMessagesSeen: number
}): HistoricalMessage | null => {
  const { message, igId, cutoff, totalMessagesSeen } = props
  const attachments = extractAttachments(message)
  if (!message.message && attachments.length === 0) {
    return null
  }

  const createdAt = parseInstagramApiDate(message.created_time)
  if (createdAt && createdAt < cutoff && totalMessagesSeen > 100) {
    return null
  }

  return {
    sourceId: message.id,
    messageType: message.from?.id === igId ? "outgoing" : "incoming",
    contentType: "text",
    text: message.message ?? "",
    createdAt,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}

export const discoverContactEnrichment = (props: {
  messages: HistoricalMessage[]
  defaultCountry: string | null
}): { phoneNumber?: string; email?: string } => {
  const discovered: { phoneNumber?: string; email?: string } = {}
  for (const message of props.messages) {
    if (!message.text || (discovered.phoneNumber && discovered.email)) {
      continue
    }
    const extracted = extractContactInfo(message.text, props.defaultCountry, {
      skipPhone: Boolean(discovered.phoneNumber),
      skipEmail: Boolean(discovered.email),
    })
    discovered.phoneNumber ??= extracted.phoneNumber
    discovered.email ??= extracted.email
  }
  return discovered
}
