import {
  coexistService,
  extractContactInfo,
  inboxService,
  workspaceService,
} from "@chatbotx.io/business"
import type { CoexistIntegrationRow } from "@chatbotx.io/database/repositories"
import type { InboxModel } from "@chatbotx.io/database/types"
import {
  fetchInstagramConversationMessages,
  type InstagramAppUsage,
  type InstagramConversation,
  type InstagramHistoryAttachment,
  type InstagramHistoryMessage,
  type InstagramParticipant,
  listInstagramConversations,
} from "@chatbotx.io/integration-instagram/apis/sync"
import {
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import type { AppUsageSignal, PullCoexistAdapter } from "./pull-adapter"

const instagramAuthSchema = z
  .object({
    tokens: z.object({ accessToken: z.string() }).passthrough(),
    metadata: z
      .object({
        igId: z.string(),
        version: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough()

const WHITESPACE_RE = /\s+/

export type InstagramCoexistContext = {
  integration: Extract<CoexistIntegrationRow, { channel: "instagram" }>
  inbox: InboxModel
  workspaceId: string
  accessToken: string
  version?: string
  igId: string
  defaultCountry: string | null
}

const splitDisplayName = (
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
  raw: InstagramHistoryAttachment,
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

const extractAttachments = (
  message: InstagramHistoryMessage,
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

const findCustomerParticipant = (props: {
  participants: InstagramParticipant[]
  messages: InstagramHistoryMessage[]
  igId: string
}): InstagramParticipant | null => {
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

const toIncomingContact = (
  participant: InstagramParticipant,
): IncomingContact => {
  const name = splitDisplayName(participant.name ?? participant.username)
  return {
    sourceId: participant.id,
    firstName: name.firstName ?? participant.username ?? participant.id,
    lastName: name.lastName,
  }
}

const toAppUsageSignal = (
  appUsage: InstagramAppUsage | null | undefined,
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

export const instagramCoexistAdapter = {
  channel: "instagram",
  async loadContext({ workspaceId, integrationId }) {
    const integration = await coexistService.findIntegrationForCoexist({
      workspaceId,
      integrationId,
      channel: "instagram",
    })
    if (!integration) {
      return null
    }
    if (integration.channel !== "instagram") {
      return null
    }
    if (!integration.coexistEnabled) {
      return null
    }

    const parsedAuth = instagramAuthSchema.safeParse(integration.auth)
    if (!parsedAuth.success) {
      throw new Error(`Instagram auth invalid: ${parsedAuth.error.message}`)
    }

    const inbox = await inboxService.find({
      where: { id: integration.inboxId },
    })
    if (!inbox) {
      throw new Error("Inbox not found")
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })

    return {
      integration,
      inbox,
      workspaceId,
      accessToken: parsedAuth.data.tokens.accessToken,
      version: parsedAuth.data.metadata.version,
      igId: parsedAuth.data.metadata.igId,
      defaultCountry: workspace?.targetCountry ?? null,
    }
  },
  async listConversations({ context, cursor }) {
    const page = await listInstagramConversations({
      igUserId: context.igId,
      accessToken: context.accessToken,
      version: context.version,
      after: cursor,
    })
    return {
      conversations: page.data,
      after: page.after,
      usageSignal: toAppUsageSignal(page.appUsage),
    }
  },
  async fetchConversationMessages({ context, conversationId, cursor }) {
    const page = await fetchInstagramConversationMessages({
      conversationId,
      accessToken: context.accessToken,
      version: context.version,
      after: cursor,
    })
    return {
      messages: page.data,
      after: page.after,
      usageSignal: toAppUsageSignal(page.appUsage),
    }
  },
  resolveContact({ context, conversation, messages }) {
    const participant = findCustomerParticipant({
      participants: conversation.participants?.data ?? [],
      messages,
      igId: context.igId,
    })
    return participant ? toIncomingContact(participant) : null
  },
  toHistoricalMessage({ context, message, cutoff, totalMessagesSeen }) {
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
      messageType: message.from?.id === context.igId ? "outgoing" : "incoming",
      contentType: "text",
      text: message.message ?? "",
      createdAt,
      ...(attachments.length > 0 ? { attachments } : {}),
    }
  },
  discoverContactEnrichment({ context, messages }) {
    const discovered: { phoneNumber?: string; email?: string } = {}
    for (const message of messages) {
      if (!message.text || (discovered.phoneNumber && discovered.email)) {
        continue
      }
      const extracted = extractContactInfo(
        message.text,
        context.defaultCountry,
        {
          skipPhone: Boolean(discovered.phoneNumber),
          skipEmail: Boolean(discovered.email),
        },
      )
      discovered.phoneNumber ??= extracted.phoneNumber
      discovered.email ??= extracted.email
    }
    return discovered
  },
  getConversationUpdatedAt({ conversation }) {
    return parseInstagramApiDate(conversation.updated_time)
  },
} satisfies PullCoexistAdapter<
  InstagramCoexistContext,
  InstagramConversation,
  InstagramHistoryMessage
>
