import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import {
  instagramBusinessClient,
  instagramCoexistGraphClient,
} from "../lib/http-client"
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

const MESSAGE_MEDIA_FIELDS =
  "attachments{id,name,mime_type,size,payload,image_data,video_data,file_url}"

const sync = createGraphConversationSync({
  client: instagramCoexistGraphClient,
  defaultVersion: DEFAULT_API_VERSION,
  rescue,
})

export const getMessageMediaUrls = (props: {
  graphMessageId: string
  accessToken: string
  version?: string
}): Promise<
  Array<{ sourceId: string; url: string; mimeType: string | null }>
> => {
  const { graphMessageId, accessToken, version = DEFAULT_API_VERSION } = props
  const endpoint = `${version}/${graphMessageId}`

  return rescue(endpoint, async () => {
    const response = await instagramBusinessClient.get<{
      attachments?: { data?: InstagramHistoryAttachment[] }
    }>(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      searchParams: { fields: MESSAGE_MEDIA_FIELDS },
    })

    return (response.attachments?.data ?? []).flatMap((attachment) => {
      const url =
        attachment.payload?.url ??
        attachment.image_data?.url ??
        attachment.video_data?.url ??
        attachment.file_url
      // Require the provider id: hydration matches fresh media to stored
      // attachments by it, so an id-less entry cannot be paired anyway.
      return url && attachment.id
        ? [
            {
              sourceId: attachment.id,
              url,
              mimeType: attachment.mime_type ?? null,
            },
          ]
        : []
    })
  })
}

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
