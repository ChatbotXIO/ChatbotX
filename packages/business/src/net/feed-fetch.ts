import {
  FeedFetchError,
  type FeedFetcher,
  type FeedFetchResult,
} from "../social-post-feed/fetcher"
import {
  POST_FEED_FETCH_BUDGET_MS,
  POST_FEED_MAX_BODY_BYTES,
  POST_FEED_MAX_REDIRECTS,
} from "../social-post-feed/limits"
import {
  baseContentType,
  type GuardedGetFailure,
  guardedGet,
  readCapped,
} from "./guarded-get"

/**
 * Node-only (undici, through `pinned-fetch`). Deliberately NOT re-exported from
 * the package index: the worker and the builder's route handlers import it from
 * its own subpath and register it (AGENTS.md invariant 25).
 */

const OK = 200
const NOT_MODIFIED = 304
const ACCEPT =
  "application/atom+xml, application/rss+xml, application/feed+json, application/xml, text/xml;q=0.9, application/json;q=0.8"
const XML_TYPE =
  /^(application|text)\/([\w.+-]*\+)?xml$|^text\/xml$|^application\/(feed\+)?json$/

const tooLarge = (): FeedFetchError =>
  new FeedFetchError("tooLarge", "The feed is larger than 2 MB")

const readBody = async (response: Response): Promise<string> =>
  new TextDecoder("utf-8").decode(
    await readCapped(response, POST_FEED_MAX_BODY_BYTES, tooLarge),
  )

/** The page's text for the alternate-link hint; null when it cannot be read within the cap. */
const readHtml = async (response: Response): Promise<string | null> => {
  try {
    return await readBody(response)
  } catch {
    return null
  }
}

const failureOf = (failure: GuardedGetFailure): FeedFetchError => {
  switch (failure) {
    case "blocked":
    case "notWeb":
      return new FeedFetchError("blocked", "The feed address is not allowed")
    case "timeout":
      return new FeedFetchError("timeout", "The feed timed out")
    case "unreachable":
      return new FeedFetchError("unreachable", "The feed could not be reached")
    case "noLocation":
      return new FeedFetchError("badStatus", "The feed redirects nowhere")
    default:
      return new FeedFetchError(
        "tooManyRedirects",
        "The feed redirects too often",
      )
  }
}

const settle = async (
  response: Response,
  signal: AbortSignal,
): Promise<FeedFetchResult> => {
  if (response.status === NOT_MODIFIED) {
    await response.body?.cancel().catch(() => undefined)
    return { kind: "notModified" }
  }
  if (response.status !== OK) {
    await response.body?.cancel().catch(() => undefined)
    throw new FeedFetchError(
      "badStatus",
      `The feed answered with status ${response.status}`,
    )
  }
  const type = baseContentType(response.headers.get("content-type"))
  if (!XML_TYPE.test(type)) {
    const html = type === "text/html" ? await readHtml(response) : null
    await response.body?.cancel().catch(() => undefined)
    throw new FeedFetchError(
      "badContentType",
      "The address is not an XML feed",
      html,
    )
  }
  const declared = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )
  if (Number.isFinite(declared) && declared > POST_FEED_MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  try {
    const body = await readBody(response)
    return {
      body,
      etag: response.headers.get("etag"),
      kind: "ok",
      lastModified: response.headers.get("last-modified"),
    }
  } catch (error) {
    if (error instanceof FeedFetchError) {
      throw error
    }
    throw new FeedFetchError(
      signal.aborted ? "timeout" : "unreachable",
      signal.aborted ? "The feed timed out" : "The feed could not be read",
    )
  }
}

export const fetchFeed: FeedFetcher = async (input) => {
  const signal = AbortSignal.timeout(POST_FEED_FETCH_BUDGET_MS)
  const { response } = await guardedGet({
    fail: failureOf,
    headers: {
      accept: ACCEPT,
      "user-agent": "ChatbotX-feed/1.0",
      ...(input.etag ? { "if-none-match": input.etag } : {}),
      ...(input.lastModified
        ? { "if-modified-since": input.lastModified }
        : {}),
    },
    maxRedirects: POST_FEED_MAX_REDIRECTS,
    signal,
    start: input.url,
  })
  return await settle(response, signal)
}
