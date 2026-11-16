import {
  fetchFollowingSafeRedirects,
  readBodyWithLimit,
} from "@chatbotx.io/filesystem"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedStore } from "@chatbotx.io/redis"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import {
  inspectImage,
  renderJpegWithinBytes,
  renderVideoPlaceholderJpeg,
} from "@chatbotx.io/utils/image-renditions"
import { assertPublicUrl } from "../net/ssrf-guard"
import { getPublicFileUrl } from "../utils"

const logger = getChildLogger("business:outbound-image-renditions")

const CACHE_KEY_PREFIX = "outbound-image-renditions:v1:"
const RESOLVED_TTL_SECONDS = 24 * 60 * 60
/** Bound on what is fetched into memory before decoding. */
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 30_000
const HTTPS_RE = /^https:\/\//i
const REUSABLE_FORMATS = new Set(["jpeg", "png"])

const ORIGINAL_DIMENSIONS = [4096, 3072, 2048] as const
const ORIGINAL_QUALITIES = [90, 80, 70, 60] as const
const PREVIEW_DIMENSIONS = [1024, 768, 512] as const
const PREVIEW_QUALITIES = [80, 70, 60, 50] as const

/**
 * Why an outbound image could not be prepared. `retryable` is true for a
 * transient fault (storage outage, unreachable host) and false for a source the
 * channel could never accept (not an image, cannot be shrunk under the cap).
 */
export class OutboundMediaError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options)
    this.name = "OutboundMediaError"
    this.retryable = retryable
  }
}

/** The slice of `ctx.uploader` this module needs. */
export type OutboundMediaUploader = {
  putObject(
    path: string,
    body: Buffer,
    options?: {
      ACL?: "public-read"
      ContentLength: number
      ContentType: string
    },
    abortSignal?: AbortSignal,
  ): Promise<unknown>
  /** Optional: lets a source already on our storage be read from the bucket. */
  getObjectStream?(
    path: string,
  ): Promise<{ stream: AsyncIterable<Uint8Array>; contentLength?: number }>
}

export type ResolveOutboundImageRenditionsInput = {
  url: string
  /** Largest original the channel accepts; a larger one is re-encoded. */
  originalMaxBytes: number
  /** Largest preview the channel accepts. */
  previewMaxBytes: number
  storagePrefix: string
  storageUrl: string
  uploader: OutboundMediaUploader | undefined
}

export type OutboundImageRenditions = {
  originalUrl: string
  previewUrl: string
}

const rejectNonPublic = async (candidate: string): Promise<void> => {
  try {
    await assertPublicUrl(candidate, "Outbound media URL")
  } catch (error) {
    throw new OutboundMediaError("The image URL is not allowed", false, {
      cause: error,
    })
  }
}

const redirectErrors = {
  tooManyRedirects: () =>
    new OutboundMediaError(
      "Too many redirects while fetching the image",
      false,
    ),
  noLocationHeader: () =>
    new OutboundMediaError("Image redirect has no Location header", false),
  invalidRedirectLocation: (location: string) =>
    new OutboundMediaError(
      `Invalid image redirect location: ${location}`,
      false,
    ),
}

const tooLarge = () =>
  new OutboundMediaError(
    `The image is larger than ${MAX_DOWNLOAD_BYTES} bytes and cannot be processed`,
    false,
  )

const downloadImage = async (url: string): Promise<Buffer> => {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  let response: Response
  try {
    ;({ response } = await fetchFollowingSafeRedirects({
      errors: redirectErrors,
      fetchImpl: (candidate) =>
        fetch(candidate, { redirect: "manual", signal }),
      url,
      validateUrl: rejectNonPublic,
    }))
  } catch (error) {
    if (error instanceof OutboundMediaError) {
      throw error
    }
    throw new OutboundMediaError("Unable to download the image", true, {
      cause: error,
    })
  }
  if (!response.ok) {
    // A 4xx is the author's broken link; a 5xx may recover.
    throw new OutboundMediaError(
      `Unable to download the image (HTTP ${response.status})`,
      response.status >= 500,
    )
  }
  const declared = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  )
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw tooLarge()
  }
  try {
    return await readBodyWithLimit(response, MAX_DOWNLOAD_BYTES, tooLarge)
  } catch (error) {
    if (error instanceof OutboundMediaError) {
      throw error
    }
    throw new OutboundMediaError("Unable to download the image", true, {
      cause: error,
    })
  }
}

/**
 * The bucket key behind `url` when it is a public file on our own storage,
 * else null. Only `public/` keys qualify: those are already readable by anyone
 * with the URL, so reading them from the bucket exposes nothing new, whereas a
 * private key would let a flow author re-host a file the public URL refuses.
 */
export const publicStorageKeyFor = (
  url: string,
  storageUrl: string,
): string | null => {
  if (!storageUrl) {
    return null
  }
  const base = storageUrl.endsWith("/") ? storageUrl : `${storageUrl}/`
  if (!url.startsWith(base)) {
    return null
  }
  let key: string
  try {
    key = decodeURIComponent(
      new URL(url).pathname.slice(new URL(base).pathname.length),
    )
  } catch {
    return null
  }
  if (!key.startsWith("public/") || key.split("/").includes("..")) {
    return null
  }
  return key
}

/**
 * Reads a file on our own storage from the bucket, skipping a round trip
 * through the public URL (CDN, proxy or tunnel) for a file the worker usually
 * uploaded moments earlier. Null when the uploader cannot read or the read
 * fails, so the caller falls back to the public URL.
 */
const readFromStorage = async (
  uploader: OutboundMediaUploader | undefined,
  key: string,
): Promise<Buffer | null> => {
  if (!uploader?.getObjectStream) {
    return null
  }
  let object: Awaited<ReturnType<NonNullable<typeof uploader.getObjectStream>>>
  try {
    object = await uploader.getObjectStream(key)
  } catch (error) {
    logger.warn(
      { err: error, key },
      "Unable to read the image from storage; fetching its URL",
    )
    return null
  }
  const iterator = object.stream[Symbol.asyncIterator]()
  try {
    if ((object.contentLength ?? 0) > MAX_DOWNLOAD_BYTES) {
      throw tooLarge()
    }
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await iterator.next()
      if (done) {
        break
      }
      total += value.length
      if (total > MAX_DOWNLOAD_BYTES) {
        throw tooLarge()
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch (error) {
    // Releases the S3 connection when the read stops early.
    await iterator.return?.()
    if (error instanceof OutboundMediaError) {
      throw error
    }
    logger.warn(
      { err: error, key },
      "Unable to read the image from storage; fetching its URL",
    )
    return null
  }
}

const loadImage = async (
  input: Pick<
    ResolveOutboundImageRenditionsInput,
    "url" | "storageUrl" | "uploader"
  >,
): Promise<Buffer> => {
  const key = publicStorageKeyFor(input.url, input.storageUrl)
  const stored = key ? await readFromStorage(input.uploader, key) : null
  return stored ?? (await downloadImage(input.url))
}

const storeJpeg = async (
  input: {
    uploader: OutboundMediaUploader | undefined
    storageUrl: string
  },
  path: string,
  bytes: Buffer,
): Promise<string> => {
  if (!input.uploader) {
    throw new OutboundMediaError("No storage is available for the image", true)
  }
  try {
    await input.uploader.putObject(
      path,
      bytes,
      {
        ACL: "public-read",
        ContentLength: bytes.length,
        ContentType: "image/jpeg",
      },
      AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    )
  } catch (error) {
    throw new OutboundMediaError("Unable to store the converted image", true, {
      cause: error,
    })
  }
  return getPublicFileUrl(path, input.storageUrl)
}

const resolveUncached = async (
  input: ResolveOutboundImageRenditionsInput,
  key: string,
): Promise<OutboundImageRenditions> => {
  const bytes = await loadImage(input)
  const inspected = await inspectImage(bytes)
  if (!inspected?.format) {
    throw new OutboundMediaError("The file is not a readable image", false)
  }

  // The source can be handed to the channel as is only when the channel can
  // fetch it as is: HTTPS, a format it decodes, within its size cap.
  const reusable =
    HTTPS_RE.test(input.url) &&
    REUSABLE_FORMATS.has(inspected.format) &&
    !inspected.animated
  const base = `${input.storagePrefix}/outbound-media/images/${key}`

  let originalUrl = input.url
  if (!(reusable && bytes.length <= input.originalMaxBytes)) {
    const original = await renderJpegWithinBytes({
      bytes,
      maxBytes: input.originalMaxBytes,
      maxDimensions: ORIGINAL_DIMENSIONS,
      qualities: ORIGINAL_QUALITIES,
    })
    if (!original) {
      throw new OutboundMediaError(
        "The image cannot be converted to a size the channel accepts",
        false,
      )
    }
    originalUrl = await storeJpeg(input, `${base}-original.jpg`, original.bytes)
  }

  let previewUrl = input.url
  const sourceIsPreview = reusable && bytes.length <= input.previewMaxBytes
  if (!sourceIsPreview) {
    const preview = await renderJpegWithinBytes({
      bytes,
      maxBytes: input.previewMaxBytes,
      maxDimensions: PREVIEW_DIMENSIONS,
      qualities: PREVIEW_QUALITIES,
    })
    if (!preview) {
      throw new OutboundMediaError(
        "A preview within the channel's size cap cannot be made",
        false,
      )
    }
    previewUrl = await storeJpeg(input, `${base}-preview.jpg`, preview.bytes)
  }

  logger.info(
    {
      sourceBytes: bytes.length,
      format: inspected.format,
      reusedOriginal: originalUrl === input.url,
      reusedPreview: previewUrl === input.url,
    },
    "Prepared outbound image renditions",
  )
  return { originalUrl, previewUrl }
}

const inFlight = new Map<string, Promise<OutboundImageRenditions>>()

/**
 * The original and preview URLs for one outgoing image, both within the
 * channel's caps. A source that already fits (HTTPS JPEG/PNG under the caps) is
 * reused as is; otherwise a JPEG rendition is written to workspace storage
 * under a key derived from the workspace and source URL, so the same image is
 * converted once (a Redis entry skips even the download for a day) and a rerun
 * overwrites the same objects. Throws `OutboundMediaError` when the image
 * cannot be made to fit; never falls back to a URL the channel would drop.
 */
export const resolveOutboundImageRenditions = async (
  input: ResolveOutboundImageRenditionsInput,
): Promise<OutboundImageRenditions> => {
  const key = await sha256Hex(
    `${input.storagePrefix}\n${input.originalMaxBytes}\n${input.previewMaxBytes}\n${input.url}`,
  )
  const cacheKey = `${CACHE_KEY_PREFIX}${key}`
  const cached = await distributedStore
    .get<OutboundImageRenditions>(cacheKey)
    .catch(() => null)
  if (cached?.originalUrl && cached.previewUrl) {
    return cached
  }

  const pending = inFlight.get(cacheKey)
  if (pending) {
    return await pending
  }
  const resolution = resolveUncached(input, key)
    .then(async (renditions) => {
      await distributedStore
        .put(cacheKey, renditions, RESOLVED_TTL_SECONDS)
        .catch((err) =>
          logger.warn({ err }, "Unable to cache outbound image renditions"),
        )
      return renditions
    })
    .finally(() => inFlight.delete(cacheKey))
  inFlight.set(cacheKey, resolution)
  return await resolution
}

const VIDEO_PLACEHOLDER_VERSION = "v1"

/**
 * The public URL of the static JPEG used as a video message's preview, written
 * to the workspace's storage on first use. The key is fixed, so a race or a
 * cache miss only rewrites the same bytes.
 */
export const resolveVideoPreviewPlaceholderUrl = async (input: {
  storagePrefix: string
  storageUrl: string
  uploader: OutboundMediaUploader | undefined
}): Promise<string> => {
  const path = `${input.storagePrefix}/outbound-media/video-preview-${VIDEO_PLACEHOLDER_VERSION}.jpg`
  const cacheKey = `${CACHE_KEY_PREFIX}video-placeholder:${path}`
  const cached = await distributedStore
    .get<{ url: string }>(cacheKey)
    .catch(() => null)
  if (cached?.url) {
    return cached.url
  }
  const url = await storeJpeg(input, path, await renderVideoPlaceholderJpeg())
  await distributedStore
    .put(cacheKey, { url }, RESOLVED_TTL_SECONDS)
    .catch(() => undefined)
  return url
}
