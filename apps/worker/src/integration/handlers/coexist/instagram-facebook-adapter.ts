import {
  coexistService,
  inboxService,
  workspaceService,
} from "@chatbotx.io/business"
import type { CoexistIntegrationRow } from "@chatbotx.io/database/repositories"
import type { InboxModel } from "@chatbotx.io/database/types"
import {
  fetchInstagramFacebookConversationMessages,
  type InstagramFacebookConversation,
  type InstagramFacebookHistoryMessage,
  listInstagramFacebookConversations,
} from "@chatbotx.io/integration-instagram-facebook/apis/sync"
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

// Coexist adapter for Instagram accounts connected via a Facebook Page
// (`type: "facebook"`). Kept fully separate from the native Instagram Login
// adapter so a future provider is a new module, not another branch here. Only
// the pull source (Page token + graph.facebook.com `?platform=instagram`) and
// context differ; message normalization is shared via `./instagram-normalize`.
const instagramFacebookAuthSchema = z
  .object({
    tokens: z.object({ accessToken: z.string() }).passthrough(),
    metadata: z
      .object({
        igId: z.string(),
        pageId: z.string(),
        version: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type InstagramFacebookCoexistContext = {
  integration: Extract<CoexistIntegrationRow, { channel: "instagram" }>
  inbox: InboxModel
  workspaceId: string
  // Page access token — Instagram-via-Facebook reads DMs through the Page node.
  accessToken: string
  version?: string
  // Instagram-scoped business id: the "self" participant in IG conversations,
  // used for direction (incoming/outgoing) and to exclude self when resolving
  // the customer.
  igId: string
  // Facebook Page id the conversations are listed from.
  pageId: string
  defaultCountry: string | null
}

export const instagramFacebookCoexistAdapter = {
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
    // Facebook-linked Instagram only. Native Instagram Login (`type:
    // "instagram"`) is handled by `instagramCoexistAdapter`.
    if (integration.type !== "facebook") {
      return null
    }
    if (!integration.coexistEnabled) {
      return null
    }

    const parsedAuth = instagramFacebookAuthSchema.safeParse(integration.auth)
    if (!parsedAuth.success) {
      throw new Error(
        `Instagram (Facebook) auth invalid: ${parsedAuth.error.message}`,
      )
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
      pageId: parsedAuth.data.metadata.pageId,
      defaultCountry: workspace?.targetCountry ?? null,
    }
  },
  async listConversations({ context, cursor }) {
    const page = await listInstagramFacebookConversations({
      pageId: context.pageId,
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
    const page = await fetchInstagramFacebookConversationMessages({
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
  // NOTE: intentionally no `resolveContactProfile`. Instagram-via-Facebook
  // cannot read a historical customer's real `name` from the user node — Meta
  // returns `(#230) User consent is required to access user profile`. The
  // username from the conversation participants edge (resolved in
  // `resolveContact`) is the best available identity for these contacts.
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
  InstagramFacebookCoexistContext,
  InstagramFacebookConversation,
  InstagramFacebookHistoryMessage
>
