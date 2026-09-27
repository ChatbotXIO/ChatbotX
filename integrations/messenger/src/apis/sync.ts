import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import {
  facebookCoexistGraphClient,
  facebookGraphClient,
} from "../lib/http-client"
import { type BucUsage, parseBucHeader } from "./usage"

/** A Messenger participant as returned by the Graph conversations edge. */
export type MessengerParticipant = {
  id: string
  name?: string
  email?: string
}

/** A conversation thread between the Page and one or more participants. */
export type MessengerConversation = {
  id: string
  participants?: { data?: MessengerParticipant[] }
  /** ISO timestamp of the latest activity in the thread. Used by coexist sync
   *  resume to filter conversations against the within-run frontier and the
   *  cross-run ceiling. */
  updated_time?: string
}

/**
 * Single attachment as returned by the Graph `attachments{...}` subfield on
 * `/conversations/<id>/messages`. Audio/video/file expose `file_url` at the
 * top level; images expose the URL via the nested `image_data.url`. Mime,
 * size, dimensions are best-effort — Graph omits them for older messages.
 */
export type MessengerHistoryAttachment = {
  id: string
  name?: string
  mime_type?: string
  size?: number
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
  /**
   * Page-sent structured message (button template): text title plus a list of
   * call-to-action buttons. Present on outgoing Page messages that were sent as
   * a generic/button template rather than plain text. No media URL — rendered
   * as text + buttons, not as a downloadable attachment.
   */
  generic_template?: {
    title?: string
    subtitle?: string
    cta?: Array<{
      title?: string
      type?: string
      url?: string
    }>
  }
}

/** A single message inside a conversation thread. */
export type MessengerHistoryMessage = {
  id: string
  message?: string
  from?: MessengerParticipant
  created_time?: string
  attachments?: { data?: MessengerHistoryAttachment[] }
}

type GraphPage<T> = {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

type PaginatedResult<T> = {
  data: T[]
  after?: string
  bucUsage?: BucUsage | null
}

const PAGE_LIMIT = 499
const MESSAGE_MEDIA_FIELDS =
  "attachments{id,name,mime_type,size,image_data,video_data,file_url}"

const nextCursor = (
  paging: GraphPage<unknown>["paging"],
): string | undefined => (paging?.next ? paging.cursors?.after : undefined)

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
    const response = await facebookGraphClient.get<{
      attachments?: { data?: MessengerHistoryAttachment[] }
    }>(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      searchParams: { fields: MESSAGE_MEDIA_FIELDS },
    })

    return (response.attachments?.data ?? []).flatMap((attachment) => {
      const url =
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

/**
 * Lists conversation threads for a Page, one Graph page at a time. The caller
 * paginates by passing `after` until it comes back `undefined`.
 */
export const listConversations = (props: {
  pageId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<PaginatedResult<MessengerConversation>> => {
  const { pageId, accessToken, version = DEFAULT_API_VERSION, after } = props
  const endpoint = `${version}/${pageId}/conversations`

  return rescue(endpoint, async () => {
    const { data: response, headers } =
      await facebookCoexistGraphClient.getWithHeaders<
        GraphPage<MessengerConversation>
      >(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: {
          fields: "id,participants,updated_time",
          platform: "MESSENGER",
          limit: String(PAGE_LIMIT),
          ...(after ? { after } : {}),
        },
      })

    return {
      data: response.data ?? [],
      after: nextCursor(response.paging),
      bucUsage: parseBucHeader(headers.get("x-business-use-case-usage")),
    }
  })
}

/**
 * Lists messages inside one conversation thread, one Graph page at a time.
 */
export const listMessages = (props: {
  conversationId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<PaginatedResult<MessengerHistoryMessage>> => {
  const {
    conversationId,
    accessToken,
    version = DEFAULT_API_VERSION,
    after,
  } = props
  const endpoint = `${version}/${conversationId}/messages`

  return rescue(endpoint, async () => {
    const { data: response, headers } =
      await facebookCoexistGraphClient.getWithHeaders<
        GraphPage<MessengerHistoryMessage>
      >(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: {
          fields:
            "id,message,from,created_time,attachments{id,name,mime_type,size,image_data,video_data,file_url,generic_template}",
          limit: String(PAGE_LIMIT),
          ...(after ? { after } : {}),
        },
      })

    return {
      data: response.data ?? [],
      after: nextCursor(response.paging),
      bucUsage: parseBucHeader(headers.get("x-business-use-case-usage")),
    }
  })
}
