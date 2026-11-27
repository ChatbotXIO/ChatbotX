import {
  type EmbeddedVideo,
  type EmbeddedVideoParseFailure,
  type EmbeddedVideoParseFailureReason,
  type EmbeddedVideoProvider,
  isSameEmbeddedVideo,
  parseEmbeddedVideoSource,
  toEmbeddedVideoAspectRatio,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { z } from "zod"
import { logger } from "../logger"

/**
 * Providers whose oEmbed answer carries the video's size. The host is fixed
 * and the user's link only travels as the `url` query value, so there is no
 * SSRF surface. YouTube is not listed: its orientation comes from the link
 * (Shorts), and its oEmbed rejects the embed forms.
 */
const EMBEDDED_VIDEO_OEMBED_ENDPOINTS: Partial<
  Record<EmbeddedVideoProvider, string>
> = {
  vimeo: "https://vimeo.com/api/oembed.json",
  streamable: "https://api.streamable.com/oembed.json",
}

const OEMBED_TIMEOUT_MS = 3000
const OEMBED_MAX_BODY_BYTES = 64 * 1024

/** A stable English message per parse failure, shown as the validation error. */
export const EMBEDDED_VIDEO_PARSE_FAILURE_MESSAGES: Record<
  EmbeddedVideoParseFailureReason,
  string
> = {
  tooLong: "The video link or embed code is too long",
  invalidUrl: "Enter a valid https video link or embed code",
  unsupportedProvider:
    "Only YouTube, Vimeo, Streamable and Cloudinary videos are supported",
  invalidVideoId: "The video link does not contain a valid video",
}

type EmbeddedVideoResolveSuccess = {
  ok: true
  /** `aspectRatio` is final: embed code, then link hint, then oEmbed, else null. */
  video: EmbeddedVideo
}
type EmbeddedVideoResolveResult =
  | EmbeddedVideoResolveSuccess
  | EmbeddedVideoParseFailure

const oEmbedSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
})

/**
 * Reads at most `OEMBED_MAX_BODY_BYTES` of the body as text, cancelling the
 * stream past the cap. Web streams only: this runs in the Edge-traced graph.
 */
const readCappedText = async (response: Response): Promise<string> => {
  if (!response.body) {
    throw new Error("oEmbed response has no body")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return text + decoder.decode()
    }
    received += value.byteLength
    if (received > OEMBED_MAX_BODY_BYTES) {
      await reader.cancel()
      throw new Error("oEmbed response is too large")
    }
    text += decoder.decode(value, { stream: true })
  }
}

const fetchOEmbedAspectRatio = async (
  endpoint: string,
  sourceUrl: string,
): Promise<number | null> => {
  const response = await fetch(
    `${endpoint}?${new URLSearchParams({ url: sourceUrl })}`,
    {
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      redirect: "error",
      headers: { Accept: "application/json" },
    },
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`oEmbed responded ${response.status}`)
  }
  const size = oEmbedSizeSchema.parse(
    JSON.parse(await readCappedText(response)),
  )
  return toEmbeddedVideoAspectRatio(size.width, size.height)
}

class EmbeddedVideoService {
  /**
   * A pasted link or embed code → the reference to store. The ratio is, in
   * order: the embed code's width/height, a link hint (Shorts), the stored
   * ratio when the video did not change, then one oEmbed call (Vimeo,
   * Streamable). Never throws: a failed lookup leaves the ratio `null` (shown
   * at 16:9) and is retried on the next save.
   */
  async resolve(
    source: string,
    current: EmbeddedVideo | null,
  ): Promise<EmbeddedVideoResolveResult> {
    const parsed = parseEmbeddedVideoSource(source)
    if (!parsed.ok) {
      return parsed
    }
    const { video, hintedAspectRatio } = parsed
    if (hintedAspectRatio !== null) {
      return { ok: true, video }
    }
    if (
      current &&
      isSameEmbeddedVideo(video, current) &&
      current.aspectRatio !== null
    ) {
      return { ok: true, video: { ...video, aspectRatio: current.aspectRatio } }
    }
    const endpoint = EMBEDDED_VIDEO_OEMBED_ENDPOINTS[video.provider]
    if (!endpoint) {
      return { ok: true, video }
    }
    try {
      const aspectRatio = await fetchOEmbedAspectRatio(
        endpoint,
        toEmbeddedVideoView(video).source,
      )
      return { ok: true, video: { ...video, aspectRatio } }
    } catch (error) {
      logger.warn(
        { err: error, provider: video.provider },
        "embedded video: oEmbed lookup failed, the ratio stays unknown",
      )
      return { ok: true, video }
    }
  }
}

export const embeddedVideoService = new EmbeddedVideoService()
