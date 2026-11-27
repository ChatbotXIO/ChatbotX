import { z } from "zod"

/**
 * Videos a user embeds from an outside platform (YouTube, Vimeo, Streamable,
 * Cloudinary). Pure and Edge-safe (no Node APIs): the client preview, zod
 * schemas and business all share it.
 *
 * Only a parsed reference (provider + ids) is ever stored, never HTML or the
 * raw link. The player `src` is rebuilt from validated fields, so a stored
 * value cannot smuggle an arbitrary URL, host or query into an iframe.
 */

export const EMBEDDED_VIDEO_PROVIDER_IDS = [
  "youtube",
  "vimeo",
  "streamable",
  "cloudinary",
] as const
export type EmbeddedVideoProvider = (typeof EMBEDDED_VIDEO_PROVIDER_IDS)[number]

export const EMBEDDED_VIDEO_SOURCE_MAX_LENGTH = 4000

/** Shown when a video has no known orientation. */
export const EMBEDDED_VIDEO_DEFAULT_ASPECT_RATIO = 16 / 9
const MIN_ASPECT_RATIO = 0.25
const MAX_ASPECT_RATIO = 4
const SHORTS_ASPECT_RATIO = 9 / 16

/** Standard YouTube video ids are exactly 11 characters from this alphabet. */
export const YOUTUBE_VIDEO_ID_FORMAT = /^[A-Za-z0-9_-]{11}$/
const VIMEO_VIDEO_ID_FORMAT = /^\d{1,12}$/
// Narrowed to the only charset observed (lowercase hex; 10 chars seen); Vimeo documents none.
const VIMEO_PRIVACY_HASH_FORMAT = /^[0-9a-f]{1,64}$/
const STREAMABLE_VIDEO_ID_FORMAT = /^[A-Za-z0-9]{1,32}$/
const CLOUDINARY_CLOUD_NAME_FORMAT = /^[A-Za-z][A-Za-z0-9-]{1,127}$/
const CLOUDINARY_PATH_SEGMENT_FORMAT = /^[A-Za-z0-9_.-]+$/
const CLOUDINARY_FILE_EXTENSION_FORMAT = /\.(?:mp4|webm)$/i
const CLOUDINARY_PATH_MAX_LENGTH = 255

// Cloudinary public ids may hold non-ASCII text; that is narrowed out of
// scope here. Also rejects empty, `.` and `..` segments.
const isCloudinaryPath = (value: string) =>
  value.length > 0 &&
  value.length <= CLOUDINARY_PATH_MAX_LENGTH &&
  value
    .split("/")
    .every(
      (segment) =>
        CLOUDINARY_PATH_SEGMENT_FORMAT.test(segment) &&
        segment !== "." &&
        segment !== "..",
    )
const isCloudinaryFilePath = (value: string) =>
  isCloudinaryPath(value) && CLOUDINARY_FILE_EXTENSION_FORMAT.test(value)

// ---------------------------------------------------------------------------
// Types

export type EmbeddedVideoAspectRatio = {
  /** width / height within 0.25–4; null when unknown (shown at 16:9). */
  aspectRatio: number | null
}

export type YoutubeReference = { provider: "youtube"; videoId: string }
export type VimeoReference = {
  provider: "vimeo"
  videoId: string
  /** Required to play an unlisted video. */
  privacyHash?: string
}
export type StreamableReference = { provider: "streamable"; videoId: string }

export type CloudinaryPlayerAsset = { kind: "player"; publicId: string }
export type CloudinaryFileAsset = { kind: "file"; path: string }
export type CloudinaryAsset = CloudinaryPlayerAsset | CloudinaryFileAsset
export type CloudinaryReference = {
  provider: "cloudinary"
  cloudName: string
  asset: CloudinaryAsset
}

export type EmbeddedVideoReference =
  | YoutubeReference
  | VimeoReference
  | StreamableReference
  | CloudinaryReference

export type YoutubeEmbeddedVideo = YoutubeReference & EmbeddedVideoAspectRatio
export type VimeoEmbeddedVideo = VimeoReference & EmbeddedVideoAspectRatio
export type StreamableEmbeddedVideo = StreamableReference &
  EmbeddedVideoAspectRatio
export type CloudinaryEmbeddedVideo = CloudinaryReference &
  EmbeddedVideoAspectRatio

/** The stored value (a jsonb column). Discriminated by `provider`. */
export type EmbeddedVideo =
  | YoutubeEmbeddedVideo
  | VimeoEmbeddedVideo
  | StreamableEmbeddedVideo
  | CloudinaryEmbeddedVideo

export type EmbeddedVideoIframePlayback = {
  kind: "iframe"
  src: string
  allow: string
}
export type EmbeddedVideoFilePlayback = { kind: "file"; src: string }
export type EmbeddedVideoPlayback =
  | EmbeddedVideoIframePlayback
  | EmbeddedVideoFilePlayback

export type EmbeddedVideoView = {
  provider: EmbeddedVideoProvider
  /** Canonical link to the video on its platform. */
  source: string
  /** Effective ratio: the stored one, or 16/9 when unknown. */
  aspectRatio: number
  playback: EmbeddedVideoPlayback
}

// ---------------------------------------------------------------------------
// Aspect ratio

/**
 * width / height clamped to 0.25–4, or null when either is not a positive
 * finite number.
 */
export const toEmbeddedVideoAspectRatio = (width: number, height: number) => {
  if (!(Number.isFinite(width) && Number.isFinite(height))) {
    return null
  }
  if (width <= 0 || height <= 0) {
    return null
  }
  const ratio = width / height
  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, ratio))
}

// ---------------------------------------------------------------------------
// Provider strategies

type EmbeddedVideoProviderStrategy<R extends EmbeddedVideoReference> = {
  /** Exact hostnames accepted (no subdomain or suffix matching). */
  hosts: readonly string[]
  /** null when the host matched but the path or ids are invalid. */
  parseUrl: (url: URL) => R | null
  toPlayback: (reference: R) => EmbeddedVideoPlayback
  toSourceUrl: (video: R & EmbeddedVideoAspectRatio) => string
  /** Orientation known from the link alone (YouTube Shorts). */
  hintAspectRatio?: (url: URL) => number | null
}

export type EmbeddedVideoProviderStrategies = {
  [P in EmbeddedVideoProvider]: EmbeddedVideoProviderStrategy<
    Extract<EmbeddedVideoReference, { provider: P }>
  >
}

const pathSegments = (url: URL) => url.pathname.split("/").filter(Boolean)

const buildUrl = (base: string, params?: Record<string, string>) => {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
const YOUTUBE_ID_PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"])

// `/embed/videoseries?list=…` is a playlist embed whose "id" fits the format.
const YOUTUBE_RESERVED_VIDEO_IDS = new Set(["videoseries"])
const isYoutubeVideoId = (videoId: string) =>
  YOUTUBE_VIDEO_ID_FORMAT.test(videoId) &&
  !YOUTUBE_RESERVED_VIDEO_IDS.has(videoId)

const toYoutubeReference = (
  videoId: string | null | undefined,
): YoutubeReference | null =>
  videoId && isYoutubeVideoId(videoId) ? { provider: "youtube", videoId } : null

const extractYoutubeId = (url: URL) => {
  const segments = pathSegments(url)
  if (url.hostname === "youtu.be") {
    return segments[0]
  }
  if (segments[0] === "watch") {
    return url.searchParams.get("v")
  }
  return YOUTUBE_ID_PATH_PREFIXES.has(segments[0] ?? "") ? segments[1] : null
}

const VIMEO_ALLOW =
  "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"

// `/{id}`, `/{id}/{hash}`, `/channels/{name}/{id}`, `/video/{id}` on the
// player host; the hash may also come as `?h=`.
const parseVimeoUrl = (url: URL): VimeoReference | null => {
  const segments = pathSegments(url)
  let rest = segments
  if (url.hostname === "player.vimeo.com") {
    if (segments[0] !== "video") {
      return null
    }
    rest = segments.slice(1)
  } else if (segments[0] === "channels") {
    rest = segments.slice(2)
  }
  const [videoId, hashSegment, ...extra] = rest
  if (!(videoId && VIMEO_VIDEO_ID_FORMAT.test(videoId)) || extra.length > 0) {
    return null
  }
  const hash = hashSegment ?? url.searchParams.get("h")
  if (hash === null || hash === undefined) {
    return { provider: "vimeo", videoId }
  }
  return VIMEO_PRIVACY_HASH_FORMAT.test(hash)
    ? { provider: "vimeo", videoId, privacyHash: hash }
    : null
}

// `/{id}`, `/e/{id}`, `/o/{id}`.
const parseStreamableUrl = (url: URL): StreamableReference | null => {
  const segments = pathSegments(url)
  let videoId: string | undefined
  if (segments.length === 1) {
    videoId = segments[0]
  } else if (segments.length === 2 && ["e", "o"].includes(segments[0] ?? "")) {
    videoId = segments[1]
  }
  return videoId && STREAMABLE_VIDEO_ID_FORMAT.test(videoId)
    ? { provider: "streamable", videoId }
    : null
}

const CLOUDINARY_ALLOW =
  "autoplay; fullscreen; encrypted-media; picture-in-picture"
const CLOUDINARY_PLAYER_BASE = "https://player.cloudinary.com/embed/"

const parseCloudinaryPlayerUrl = (url: URL): CloudinaryReference | null => {
  if (pathSegments(url).join("/") !== "embed") {
    return null
  }
  const cloudName = url.searchParams.get("cloud_name")
  const publicId = url.searchParams.get("public_id")
  if (
    !(
      cloudName &&
      publicId &&
      CLOUDINARY_CLOUD_NAME_FORMAT.test(cloudName) &&
      isCloudinaryPath(publicId)
    )
  ) {
    return null
  }
  return {
    provider: "cloudinary",
    cloudName,
    asset: { kind: "player", publicId },
  }
}

// `/{cloud}/video/upload/[v123/]{public_id}.{mp4|webm}`. A transformation
// segment (`c_scale,w_200`) fails the path charset, so it is rejected rather
// than guessed at.
const parseCloudinaryFileUrl = (url: URL): CloudinaryReference | null => {
  const [cloudName, type, delivery, ...rest] = pathSegments(url)
  if (
    !(cloudName && CLOUDINARY_CLOUD_NAME_FORMAT.test(cloudName)) ||
    type !== "video" ||
    delivery !== "upload"
  ) {
    return null
  }
  const path = rest.join("/")
  if (!isCloudinaryFilePath(path)) {
    return null
  }
  return {
    provider: "cloudinary",
    cloudName,
    asset: { kind: "file", path },
  }
}

const CLOUDINARY_URL_PARSERS: Record<
  string,
  (url: URL) => CloudinaryReference | null
> = {
  "player.cloudinary.com": parseCloudinaryPlayerUrl,
  "res.cloudinary.com": parseCloudinaryFileUrl,
}

const toCloudinaryFileUrl = (cloudName: string, path: string) =>
  `https://res.cloudinary.com/${cloudName}/video/upload/${path}`

export const EMBEDDED_VIDEO_PROVIDERS: EmbeddedVideoProviderStrategies = {
  youtube: {
    hosts: [
      "www.youtube.com",
      "youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
    ],
    parseUrl: (url) => toYoutubeReference(extractYoutubeId(url)),
    // Always the no-cookie host; it plays every id (verified).
    toPlayback: ({ videoId }) => ({
      kind: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${videoId}`,
      allow: YOUTUBE_ALLOW,
    }),
    // Only an exact Shorts ratio links to /shorts/ (it re-parses with the same
    // hint). Any other ratio links to /watch so the stored ratio is kept on a
    // GET → PUT echo instead of being overridden by the Shorts hint.
    toSourceUrl: ({ videoId, aspectRatio }) =>
      aspectRatio === SHORTS_ASPECT_RATIO
        ? `https://www.youtube.com/shorts/${videoId}`
        : buildUrl("https://www.youtube.com/watch", { v: videoId }),
    hintAspectRatio: (url) =>
      url.pathname.startsWith("/shorts/") ? SHORTS_ASPECT_RATIO : null,
  },
  vimeo: {
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    parseUrl: parseVimeoUrl,
    toPlayback: ({ videoId, privacyHash }) => ({
      kind: "iframe",
      src: buildUrl(
        `https://player.vimeo.com/video/${videoId}`,
        privacyHash ? { h: privacyHash } : undefined,
      ),
      allow: VIMEO_ALLOW,
    }),
    toSourceUrl: ({ videoId, privacyHash }) =>
      `https://vimeo.com/${videoId}${privacyHash ? `/${privacyHash}` : ""}`,
  },
  streamable: {
    // `www.streamable.com` is not accepted: Streamable itself rejects it.
    hosts: ["streamable.com"],
    parseUrl: parseStreamableUrl,
    toPlayback: ({ videoId }) => ({
      kind: "iframe",
      src: `https://streamable.com/o/${videoId}`,
      allow: "fullscreen",
    }),
    toSourceUrl: ({ videoId }) => `https://streamable.com/${videoId}`,
  },
  cloudinary: {
    hosts: Object.keys(CLOUDINARY_URL_PARSERS),
    parseUrl: (url) => CLOUDINARY_URL_PARSERS[url.hostname]?.(url) ?? null,
    toPlayback: ({ cloudName, asset }) =>
      asset.kind === "file"
        ? { kind: "file", src: toCloudinaryFileUrl(cloudName, asset.path) }
        : {
            kind: "iframe",
            src: buildUrl(CLOUDINARY_PLAYER_BASE, {
              cloud_name: cloudName,
              public_id: asset.publicId,
            }),
            allow: CLOUDINARY_ALLOW,
          },
    toSourceUrl: ({ cloudName, asset }) =>
      asset.kind === "file"
        ? toCloudinaryFileUrl(cloudName, asset.path)
        : buildUrl(CLOUDINARY_PLAYER_BASE, {
            cloud_name: cloudName,
            public_id: asset.publicId,
          }),
  },
}

const ALL_STRATEGIES = EMBEDDED_VIDEO_PROVIDER_IDS.map(
  (id) => EMBEDDED_VIDEO_PROVIDERS[id],
)

/**
 * The strategy map is keyed by provider, so `strategies[ref.provider]` is
 * correct for `ref` but TypeScript cannot correlate the two. This is the
 * single place that cast lives.
 */
const strategyFor = <R extends EmbeddedVideoReference>(
  reference: R,
): EmbeddedVideoProviderStrategy<R> =>
  EMBEDDED_VIDEO_PROVIDERS[
    reference.provider
  ] as unknown as EmbeddedVideoProviderStrategy<R>

// ---------------------------------------------------------------------------
// Parsing

export const EMBEDDED_VIDEO_PARSE_FAILURE_REASONS = [
  "tooLong",
  "invalidUrl",
  "unsupportedProvider",
  "invalidVideoId",
] as const
export type EmbeddedVideoParseFailureReason =
  (typeof EMBEDDED_VIDEO_PARSE_FAILURE_REASONS)[number]

export type EmbeddedVideoParseSuccess = {
  ok: true
  /** `aspectRatio` is already `hintedAspectRatio`. */
  video: EmbeddedVideo
  /**
   * Ratio known without a network call (embed code width/height, else a
   * Shorts link); null means ask the provider's oEmbed.
   */
  hintedAspectRatio: number | null
}
export type EmbeddedVideoParseFailure = {
  ok: false
  reason: EmbeddedVideoParseFailureReason
}
export type EmbeddedVideoParseResult =
  | EmbeddedVideoParseSuccess
  | EmbeddedVideoParseFailure

const fail = (
  reason: EmbeddedVideoParseFailureReason,
): EmbeddedVideoParseFailure => ({ ok: false, reason })

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
}
const ENTITY_PATTERN = /&(?:amp|quot|#39|lt|gt);/g
// Single pass: `&amp;lt;` becomes `&lt;`, never `<`.
const decodeEntities = (value: string) =>
  value.replace(ENTITY_PATTERN, (entity) => ENTITIES[entity] ?? entity)

const IFRAME_TAG_PATTERN = /<iframe\b(?:"[^"]*"|'[^']*'|[^>"'])*>/i
// One left-to-right pass: a quoted value is consumed with its attribute, so
// `title="x src='…'"` never yields a `src`. The first occurrence of a name wins.
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const NUMERIC_ATTRIBUTE = /^\d+(?:\.\d+)?$/

const readAttributes = (tag: string) => {
  const attributes = new Map<string, string>()
  for (const [, name, doubleQuoted, singleQuoted] of tag.matchAll(
    ATTRIBUTE_PATTERN,
  )) {
    const key = (name ?? "").toLowerCase()
    if (!attributes.has(key)) {
      attributes.set(key, decodeEntities(doubleQuoted ?? singleQuoted ?? ""))
    }
  }
  return attributes
}

const readEmbedCodeRatio = (attributes: Map<string, string>) => {
  const width = attributes.get("width")
  const height = attributes.get("height")
  if (
    !(
      width &&
      height &&
      NUMERIC_ATTRIBUTE.test(width) &&
      NUMERIC_ATTRIBUTE.test(height)
    )
  ) {
    return null
  }
  return toEmbeddedVideoAspectRatio(Number(width), Number(height))
}

type ExtractedSource = { link: string; embedRatio: number | null }

/** A bare link, or the first `<iframe>` of pasted embed code. */
const extractSource = (input: string): ExtractedSource | null => {
  if (!input.includes("<")) {
    return { link: input, embedRatio: null }
  }
  const tag = IFRAME_TAG_PATTERN.exec(input)?.[0]
  const attributes = tag ? readAttributes(tag) : null
  const src = attributes?.get("src")
  return attributes && src
    ? { link: src.trim(), embedRatio: readEmbedCodeRatio(attributes) }
    : null
}

const toHttpsUrl = (link: string) => {
  try {
    const url = new URL(link)
    const isPlain = !(url.username || url.password || url.port)
    return url.protocol === "https:" && isPlain ? url : null
  } catch {
    return null
  }
}

/**
 * A pasted link or embed code → the stored reference. Never throws; failures
 * carry a stable `reason` code.
 */
export const parseEmbeddedVideoSource = (
  input: string,
): EmbeddedVideoParseResult => {
  if (input.length > EMBEDDED_VIDEO_SOURCE_MAX_LENGTH) {
    return fail("tooLong")
  }
  const source = extractSource(input.trim())
  const url = source ? toHttpsUrl(source.link) : null
  if (!(source && url)) {
    return fail("invalidUrl")
  }
  const strategy = ALL_STRATEGIES.find((candidate) =>
    candidate.hosts.includes(url.hostname),
  )
  if (!strategy) {
    return fail("unsupportedProvider")
  }
  const reference = strategy.parseUrl(url)
  if (!reference) {
    return fail("invalidVideoId")
  }
  const hintedAspectRatio =
    source.embedRatio ?? strategy.hintAspectRatio?.(url) ?? null
  return {
    ok: true,
    video: { ...reference, aspectRatio: hintedAspectRatio },
    hintedAspectRatio,
  }
}

/** A legacy bare YouTube id; empty or malformed → null. */
export const fromYoutubeVideoId = (
  videoId: string | null | undefined,
): YoutubeEmbeddedVideo | null => {
  const reference = toYoutubeReference(videoId)
  return reference ? { ...reference, aspectRatio: null } : null
}

/** Same video, whatever the stored ratio. */
export const isSameEmbeddedVideo = (a: EmbeddedVideo, b: EmbeddedVideo) =>
  a.provider === b.provider &&
  strategyFor(a).toSourceUrl({ ...a, aspectRatio: null }) ===
    strategyFor(b).toSourceUrl({ ...b, aspectRatio: null })

export const toEmbeddedVideoView = (
  video: EmbeddedVideo,
): EmbeddedVideoView => {
  const strategy = strategyFor(video)
  return {
    provider: video.provider,
    source: strategy.toSourceUrl(video),
    aspectRatio: video.aspectRatio ?? EMBEDDED_VIDEO_DEFAULT_ASPECT_RATIO,
    playback: strategy.toPlayback(video),
  }
}

// ---------------------------------------------------------------------------
// Schemas

const aspectRatioSchema = z
  .number()
  .min(MIN_ASPECT_RATIO)
  .max(MAX_ASPECT_RATIO)
  .nullable()

const cloudinaryAssetSchema: z.ZodType<CloudinaryAsset> = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("player"),
      publicId: z.string().refine(isCloudinaryPath),
    }),
    z.object({
      kind: z.literal("file"),
      path: z.string().refine(isCloudinaryFilePath),
    }),
  ],
)

/** `safeParse` values read from the database; a failure means "no video". */
export const embeddedVideoSchema: z.ZodType<EmbeddedVideo> =
  z.discriminatedUnion("provider", [
    z.object({
      provider: z.literal("youtube"),
      videoId: z.string().refine(isYoutubeVideoId),
      aspectRatio: aspectRatioSchema,
    }),
    z.object({
      provider: z.literal("vimeo"),
      videoId: z.string().regex(VIMEO_VIDEO_ID_FORMAT),
      privacyHash: z.string().regex(VIMEO_PRIVACY_HASH_FORMAT).optional(),
      aspectRatio: aspectRatioSchema,
    }),
    z.object({
      provider: z.literal("streamable"),
      videoId: z.string().regex(STREAMABLE_VIDEO_ID_FORMAT),
      aspectRatio: aspectRatioSchema,
    }),
    z.object({
      provider: z.literal("cloudinary"),
      cloudName: z.string().regex(CLOUDINARY_CLOUD_NAME_FORMAT),
      asset: cloudinaryAssetSchema,
      aspectRatio: aspectRatioSchema,
    }),
  ])

/** The API/page-props output shape of `toEmbeddedVideoView`. */
export const embeddedVideoViewSchema: z.ZodType<EmbeddedVideoView> = z.object({
  provider: z.enum(EMBEDDED_VIDEO_PROVIDER_IDS),
  source: z.string(),
  aspectRatio: z.number(),
  playback: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("iframe"),
      src: z.string(),
      allow: z.string(),
    }),
    z.object({ kind: z.literal("file"), src: z.string() }),
  ]),
})
