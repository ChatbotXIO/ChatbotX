import type {
  ChannelPostContentType,
  ChannelPostLiveStatus,
} from "@chatbotx.io/database/partials"
import {
  ClapperboardIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  type LucideIcon,
  RadioIcon,
  VideoIcon,
} from "lucide-react"
import type { PostTypeOption } from "./posts-search-params"

export type PostTypeTile = { icon: LucideIcon; tone: string }

/** The coloured tile beside each entry of the post-type filter. */
export const POST_TYPE_TILES: Record<PostTypeOption, PostTypeTile> = {
  all: { icon: LayersIcon, tone: "bg-violet-500" },
  liveNow: { icon: RadioIcon, tone: "bg-red-500" },
  pastLive: { icon: VideoIcon, tone: "bg-slate-500" },
  photo: { icon: ImageIcon, tone: "bg-blue-500" },
  post: { icon: FileTextIcon, tone: "bg-amber-500" },
  video: { icon: ClapperboardIcon, tone: "bg-pink-500" },
}

/** The small badge on a post's thumbnail. */
export const CONTENT_TYPE_TILES: Record<ChannelPostContentType, PostTypeTile> =
  {
    audio: POST_TYPE_TILES.post,
    carousel: POST_TYPE_TILES.photo,
    link: POST_TYPE_TILES.post,
    live: POST_TYPE_TILES.liveNow,
    other: POST_TYPE_TILES.post,
    photo: POST_TYPE_TILES.photo,
    reel: POST_TYPE_TILES.video,
    story: POST_TYPE_TILES.photo,
    text: POST_TYPE_TILES.post,
    video: POST_TYPE_TILES.video,
  }

/** The i18n key (under `posts.`) of a post badge's label. */
type PostTileLabelKey =
  | `contentType.${ChannelPostContentType}`
  | "postType.pastLive"

/** A tile and the label key it stands for. */
type PostTileDisplay = { labelKey: PostTileLabelKey; tile: PostTypeTile }

/**
 * What a post's thumbnail badge shows, from its content type and live status.
 * A broadcast that is over reads "Past live", the same entry as the filter.
 */
type PostTileInput = {
  contentType: ChannelPostContentType | null
  liveStatus: ChannelPostLiveStatus | null
}

const PAST_LIVE_DISPLAY: PostTileDisplay = {
  labelKey: "postType.pastLive",
  tile: POST_TYPE_TILES.pastLive,
}

export const resolvePostTile = ({
  contentType,
  liveStatus,
}: PostTileInput): PostTileDisplay | undefined => {
  if (!contentType) {
    return
  }
  if (contentType === "live" && liveStatus === "ended") {
    return PAST_LIVE_DISPLAY
  }
  return {
    labelKey: `contentType.${contentType}`,
    tile: CONTENT_TYPE_TILES[contentType],
  }
}
