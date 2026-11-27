import {
  fetchFollowingSafeRedirects,
  UploadValidationError,
  uploadFileFromUrl,
} from "@chatbotx.io/filesystem"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedStore } from "@chatbotx.io/redis"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { assertPublicUrl } from "../net/ssrf-guard"
import { getPublicFileUrl, HTTP_URL_RE } from "../utils"

const logger = getChildLogger("business:outbound-media")

const CACHE_KEY_PREFIX = "outbound-media:v1:"
/** A checked or re-hosted URL is reused for a day, so a broadcast probes once. */
const RESOLVED_TTL_SECONDS = 24 * 60 * 60
/** A failed probe is retried soon, but not once per recipient. */
const FAILED_TTL_SECONDS = 5 * 60
const PROBE_TIMEOUT_MS = 5000
const DOWNLOAD_TIMEOUT_MS = 30_000

export type ResolveOutboundMediaUrlInput = {
  /** The link as it will be sent to the channel. */
  url: string
  /** MIME types the channel accepts for this media kind (e.g. WhatsApp images). */
  allowedMimeTypes: readonly string[]
  /** Size cap the channel enforces; a larger file is not re-hosted. */
  maxBytes: number
  /** Workspace storage prefix (`ctx.storagePrefix`) a re-hosted copy is written under. */
  storagePrefix: string
  /** Public storage base URL (`ctx.platform.storageUrl`). */
  storageUrl: string
}

type CachedResolution = { url: string }

/**
 * The served base type exactly as the channel will see it. Deliberately not
 * `normalizeMimeType`: aliasing `image/jpg` to `image/jpeg` here would accept
 * the very header the channel rejects.
 */
const servedBaseMimeType = (contentType: string | null): string | null =>
  contentType ? (contentType.split(";")[0] ?? "").trim().toLowerCase() : null

const validatePublicUrl = async (candidateUrl: string): Promise<void> => {
  try {
    await assertPublicUrl(candidateUrl, "Outbound media URL")
  } catch {
    throw new UploadValidationError("The media URL is not allowed")
  }
}

const redirectErrors = {
  tooManyRedirects: () =>
    new UploadValidationError("Too many redirects while probing media"),
  noLocationHeader: () =>
    new UploadValidationError("Redirect response has no Location header"),
  invalidRedirectLocation: (location: string) =>
    new UploadValidationError(`Invalid redirect location: ${location}`),
}

/**
 * The `Content-Type` the host serves `url` with, or `null` when the host does
 * not answer a HEAD request usefully. Every redirect hop is SSRF-checked.
 */
const probeMimeType = async (url: string): Promise<string | null> => {
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  const { response } = await fetchFollowingSafeRedirects({
    errors: redirectErrors,
    fetchImpl: (candidateUrl) =>
      fetch(candidateUrl, { method: "HEAD", redirect: "manual", signal }),
    url,
    validateUrl: validatePublicUrl,
  })
  if (!response.ok) {
    return null
  }
  return servedBaseMimeType(response.headers.get("content-type"))
}

/**
 * Downloads `url` into workspace storage (the stored type is normalized, so
 * `image/jpg` becomes `image/jpeg`) and returns the public URL of the copy, or
 * `null` when the file is not a type the channel accepts even after
 * normalization (an HTML error page, a GIF sent as an image, ...).
 */
const rehost = async (
  input: ResolveOutboundMediaUrlInput,
  key: string,
): Promise<string | null> => {
  const path = `${input.storagePrefix}/outbound-media/${key}`
  const uploaded = await uploadFileFromUrl(
    input.url,
    path,
    "public-read",
    input.maxBytes,
    validatePublicUrl,
    AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  )
  if (!input.allowedMimeTypes.includes(uploaded.mimeType)) {
    return null
  }
  return getPublicFileUrl(path, input.storageUrl)
}

/** In-process single flight, so concurrent sends of one URL download it once. */
const inFlight = new Map<string, Promise<string>>()

const resolveUncached = async (
  input: ResolveOutboundMediaUrlInput,
  key: string,
  cacheKey: string,
): Promise<string> => {
  try {
    const servedType = await probeMimeType(input.url)
    if (servedType && input.allowedMimeTypes.includes(servedType)) {
      await distributedStore.put(
        cacheKey,
        { url: input.url } satisfies CachedResolution,
        RESOLVED_TTL_SECONDS,
      )
      return input.url
    }

    const rehostedUrl = await rehost(input, key)
    if (rehostedUrl) {
      logger.info(
        { servedType, path: `${input.storagePrefix}/outbound-media/${key}` },
        "Re-hosted outbound media served with an unsupported content type",
      )
    }
    await distributedStore.put(
      cacheKey,
      { url: rehostedUrl ?? input.url } satisfies CachedResolution,
      RESOLVED_TTL_SECONDS,
    )
    return rehostedUrl ?? input.url
  } catch (error) {
    // Any failure (unreachable host, SSRF rejection, oversized file, storage
    // outage) falls back to the original link — exactly today's behavior —
    // and the channel reports its own error if it cannot fetch it either.
    logger.warn({ err: error }, "Unable to verify outbound media URL")
    await distributedStore
      .put(
        cacheKey,
        { url: input.url } satisfies CachedResolution,
        FAILED_TTL_SECONDS,
      )
      .catch(() => undefined)
    return input.url
  }
}

/**
 * Whether `url` is a file on our own storage. Compares on a path boundary so a
 * sibling such as `…/bucket-public/x.jpg` is not taken for `…/bucket`, and an
 * empty storage URL matches nothing.
 */
const isOnStorage = (url: string, storageUrl: string): boolean => {
  if (!storageUrl) {
    return false
  }
  const base = storageUrl.endsWith("/") ? storageUrl : `${storageUrl}/`
  return url.startsWith(base)
}

/**
 * Returns a URL the channel can fetch for an outgoing media message. A link on
 * our own storage is returned unchanged (uploads store a normalized type). An
 * external link is probed once; when its host serves a `Content-Type` the
 * channel rejects (e.g. `image/jpg` — WhatsApp error 131053), the file is
 * copied into the workspace's storage and the copy's URL is returned instead.
 * Results are cached per workspace storage prefix and URL. Never throws: on
 * any failure the original URL is returned.
 */
export const resolveOutboundMediaUrl = async (
  input: ResolveOutboundMediaUrlInput,
): Promise<string> => {
  const { url } = input
  if (!HTTP_URL_RE.test(url) || isOnStorage(url, input.storageUrl)) {
    return url
  }

  const key = await sha256Hex(
    `${input.storagePrefix}\n${input.allowedMimeTypes.join(",")}\n${url}`,
  )
  const cacheKey = `${CACHE_KEY_PREFIX}${key}`

  const cached = await distributedStore
    .get<CachedResolution>(cacheKey)
    .catch(() => null)
  if (cached?.url) {
    return cached.url
  }

  const pending = inFlight.get(cacheKey)
  if (pending) {
    return await pending
  }
  const resolution = resolveUncached(input, key, cacheKey).finally(() =>
    inFlight.delete(cacheKey),
  )
  inFlight.set(cacheKey, resolution)
  return await resolution
}
