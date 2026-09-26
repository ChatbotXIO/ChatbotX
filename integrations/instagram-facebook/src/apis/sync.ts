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
import {
  instagramFacebookCoexistGraphClient,
  instagramGraphClient,
} from "../lib/http-client"

// Coexist history sync for Instagram accounts connected via a Facebook Page
// (`type: "facebook"`). Conversations are read from the Page node on
// graph.facebook.com with `platform=instagram`, using the Page access token.

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

type MessageHistoryAttachment = {
  id: string
  name?: string
  mime_type?: string
  size?: number
  payload?: { url?: string }
  image_data?: { url?: string }
  video_data?: { url?: string }
  file_url?: string
}

const MESSAGE_MEDIA_FIELDS =
  "attachments{id,name,mime_type,size,payload,image_data,video_data,file_url}"

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
    const response = await instagramGraphClient.get<{
      attachments?: { data?: MessageHistoryAttachment[] }
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
