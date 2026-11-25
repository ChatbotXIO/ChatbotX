import type {
  ChannelPostListItem,
  ChannelPostLiveState,
} from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schema"

/**
 * Fields read from `GET /{ig-user-id}/live_media`, which returns only the media
 * being broadcast at request time (permissions `instagram_basic` and
 * `pages_read_engagement`; a past live cannot be listed).
 */
const LIVE_MEDIA_FIELDS =
  "id,caption,permalink,timestamp,media_type,media_product_type"

type InstagramLiveMedia = {
  caption?: string
  id: string
  permalink?: string
  timestamp?: string
}

export type InstagramLiveMediaPage = {
  data: InstagramLiveMedia[]
  paging?: { cursors?: { after?: string }; next?: string }
}

/** Most live media one Graph page returns (an account has very few at a time). */
const LIVE_MEDIA_PAGE_SIZE = 25

export const toLiveMediaListItem = (
  media: InstagramLiveMedia,
): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: media.caption ?? null,
  commentsCount: null,
  contentType: "live",
  externalPostId: media.id,
  liveStatus: "live",
  mediaType: "live",
  permalink: media.permalink ?? null,
  publishedAt: media.timestamp ? new Date(media.timestamp) : null,
  reactionsCount: null,
  sharesCount: null,
  thumbnailUrl: null,
  viewsCount: null,
})

/** One page of the media being broadcast now. */
export const listLiveMedia = (props: {
  after?: string
  auth: InstagramAuthValue
}): Promise<InstagramLiveMediaPage> => {
  const { after, auth } = props
  const endpoint = `${auth.metadata.version ?? DEFAULT_API_VERSION}/${auth.metadata.igId}/live_media`
  return rescue(endpoint, () =>
    instagramGraphClient.get<InstagramLiveMediaPage>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields: LIVE_MEDIA_FIELDS,
        limit: String(LIVE_MEDIA_PAGE_SIZE),
        ...(after ? { after } : {}),
      },
    }),
  )
}

/** Pages of live media one state read looks through before it gives up. */
const LIVE_STATE_MAX_PAGES = 4

/**
 * Whether a media is being broadcast. `live_media` answers only for the moment
 * of the request, so after a successful, fully read answer a media that is not
 * listed is over (`ended`); a failed call throws, and a list longer than the
 * pages read here is `unknown` rather than a guess.
 */
export const getLiveState = async (props: {
  auth: InstagramAuthValue
  postId: string
}): Promise<ChannelPostLiveState> => {
  let after: string | undefined
  for (let page = 0; page < LIVE_STATE_MAX_PAGES; page += 1) {
    const result = await listLiveMedia({ after, auth: props.auth })
    if (result.data.some((media) => media.id === props.postId)) {
      return "live"
    }
    const next = result.paging?.cursors?.after
    if (!(result.paging?.next && next)) {
      return "ended"
    }
    after = next
  }
  return "unknown"
}
