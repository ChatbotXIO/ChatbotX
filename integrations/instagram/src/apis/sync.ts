import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramCoexistGraphClient } from "../lib/http-client"
import {
  createGraphConversationSync,
  type GraphSyncAppUsage,
  type GraphSyncConversation,
  type GraphSyncHistoryAttachment,
  type GraphSyncHistoryMessage,
  type GraphSyncPaginatedResult,
  type GraphSyncParticipant,
} from "./graph-conversation-sync"

// Native Instagram Login coexist pull. Conversations are read from the IG user
// node on graph.instagram.com. All Graph messaging logic is shared via
// `createGraphConversationSync`; this module only binds the native client.

export type InstagramParticipant = GraphSyncParticipant
export type InstagramHistoryAttachment = GraphSyncHistoryAttachment
export type InstagramHistoryMessage = GraphSyncHistoryMessage
export type InstagramConversation = GraphSyncConversation
export type InstagramAppUsage = GraphSyncAppUsage

const sync = createGraphConversationSync({
  client: instagramCoexistGraphClient,
  defaultVersion: DEFAULT_API_VERSION,
  rescue,
})

export const listInstagramConversations = (props: {
  igUserId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<GraphSyncPaginatedResult<InstagramConversation>> =>
  sync.listConversations({
    node: props.igUserId,
    accessToken: props.accessToken,
    version: props.version,
    after: props.after,
  })

export const fetchInstagramConversationMessages = (props: {
  conversationId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<GraphSyncPaginatedResult<InstagramHistoryMessage>> =>
  sync.fetchConversationMessages(props)

export const fetchInstagramParticipantProfile = (props: {
  userId: string
  accessToken: string
  version?: string
}) => sync.fetchContactProfile(props)
