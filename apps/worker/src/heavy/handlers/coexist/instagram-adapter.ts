import {
  coexistService,
  inboxService,
  workspaceService,
} from "@chatbotx.io/business"
import type { CoexistIntegrationRow } from "@chatbotx.io/database/repositories"
import type { InboxModel } from "@chatbotx.io/database/types"
import {
  fetchInstagramConversationMessages,
  fetchInstagramParticipantProfile,
  type InstagramConversation,
  type InstagramHistoryMessage,
  listInstagramConversations,
} from "@chatbotx.io/integration-instagram/apis/sync"
import { z } from "zod"
import {
  buildHistoricalMessage,
  discoverContactEnrichment,
  findCustomerParticipant,
  parseInstagramApiDate,
  toAppUsageSignal,
  toIncomingContact,
} from "./instagram-normalize"
import type { PullCoexistAdapter } from "./pull-adapter"

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

export type InstagramCoexistContext = {
  integration: Extract<CoexistIntegrationRow, { channel: "instagram" }>
  inbox: InboxModel
  workspaceId: string
  accessToken: string
  version?: string
  igId: string
  defaultCountry: string | null
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
    // Native Instagram Login only. Facebook-linked Instagram (`type:"facebook"`)
    // is handled by `instagramFacebookCoexistAdapter`.
    if (integration.type !== "instagram") {
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
  async resolveContactProfile({ context, sourceId }) {
    const { profile, appUsage } = await fetchInstagramParticipantProfile({
      userId: sourceId,
      accessToken: context.accessToken,
      version: context.version,
    })
    return {
      name: profile.name ?? null,
      usageSignal: toAppUsageSignal(appUsage),
    }
  },
  toHistoricalMessage({ context, message, cutoff, totalMessagesSeen }) {
    return buildHistoricalMessage({
      message,
      igId: context.igId,
      cutoff,
      totalMessagesSeen,
    })
  },
  discoverContactEnrichment({ context, messages }) {
    return discoverContactEnrichment({
      messages,
      defaultCountry: context.defaultCountry,
    })
  },
  getConversationUpdatedAt({ conversation }) {
    return parseInstagramApiDate(conversation.updated_time)
  },
} satisfies PullCoexistAdapter<
  InstagramCoexistContext,
  InstagramConversation,
  InstagramHistoryMessage
>
