import {
  type EmbeddedVideo,
  type EmbeddedVideoView,
  embeddedVideoSchema,
  fromYoutubeVideoId,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"

export type TemplateVideoRow = {
  embeddedVideo: unknown
  youtubeVideoId: string | null
}

/**
 * The one read path for a template's video. `embeddedVideo` is the source of
 * truth, but a pod that predates it only ever writes `youtubeVideoId`, so the
 * legacy column can be fresher during a rolling deploy:
 *  1. `embeddedVideo` that does not parse counts as absent (never throws);
 *  2. YouTube `embeddedVideo` with a null or different valid legacy id: the
 *     legacy column wins (an old pod cleared or changed it);
 *  3. another provider with a valid legacy id: the legacy id wins (an old pod
 *     set a YouTube video);
 *  4. no `embeddedVideo`: the legacy id (every pre-existing row, no backfill).
 * A malformed legacy id never wins over a valid `embeddedVideo`.
 */
export const resolveTemplateEmbeddedVideo = (
  row: TemplateVideoRow,
): EmbeddedVideo | null => {
  const parsed = embeddedVideoSchema.safeParse(row.embeddedVideo)
  const stored = parsed.success ? parsed.data : null
  const legacy = fromYoutubeVideoId(row.youtubeVideoId)
  if (!stored) {
    return legacy
  }
  if (stored.provider === "youtube") {
    if (row.youtubeVideoId === null) {
      return null
    }
    return legacy && legacy.videoId !== stored.videoId ? legacy : stored
  }
  return legacy ?? stored
}

export type TemplateVideoProjection = {
  video: EmbeddedVideoView | null
  /** @deprecated Derived from `video`: the id for YouTube, else null. */
  youtubeVideoId: string | null
}

/**
 * The reconciled video of a template row as every read surface shows it: the
 * render-ready view plus the deprecated `youtubeVideoId` derived from it.
 * Pure (no network), so a list of rows costs nothing extra.
 */
export const toTemplateVideoProjection = (
  row: TemplateVideoRow,
): TemplateVideoProjection => {
  const video = resolveTemplateEmbeddedVideo(row)
  return {
    video: video && toEmbeddedVideoView(video),
    youtubeVideoId: video?.provider === "youtube" ? video.videoId : null,
  }
}
