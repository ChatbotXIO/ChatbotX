import {
  createGraphConversationSync,
  type GraphSyncAppUsage,
  type GraphSyncConversation,
  type GraphSyncHistoryAttachment,
  type GraphSyncHistoryMessage,
  type GraphSyncPaginatedResult,
  type GraphSyncParticipant,
} from "@chatbotx.io/integration-instagram/apis/graph-conversation-sync"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramFacebookCoexistGraphClient } from "../lib/http-client"

// Coexist history sync for Instagram accounts connected via a Facebook Page
// (`type: "facebook"`). Conversations are read from the Page node on
// graph.facebook.com with `platform=instagram`, using the Page access token
// (per Meta's Conversations API). All Graph messaging logic is shared via
// `createGraphConversationSync`; this module only binds the Facebook client and
// the `platform=instagram` selector.

export type InstagramFacebookParticipant = GraphSyncParticipant
export type InstagramFacebookHistoryAttachment = GraphSyncHistoryAttachment
export type InstagramFacebookHistoryMessage = GraphSyncHistoryMessage
export type InstagramFacebookConversation = GraphSyncConversation
export type InstagramFacebookAppUsage = GraphSyncAppUsage

const sync = createGraphConversationSync({
  client: instagramFacebookCoexistGraphClient,
  defaultVersion: DEFAULT_API_VERSION,
  rescue,
})

export const listInstagramFacebookConversations = (props: {
  pageId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<GraphSyncPaginatedResult<InstagramFacebookConversation>> =>
  sync.listConversations({
    node: props.pageId,
    accessToken: props.accessToken,
    version: props.version,
    after: props.after,
    searchParams: { platform: "instagram" },
  })

export const fetchInstagramFacebookConversationMessages = (props: {
  conversationId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<GraphSyncPaginatedResult<InstagramFacebookHistoryMessage>> =>
  sync.fetchConversationMessages(props)
