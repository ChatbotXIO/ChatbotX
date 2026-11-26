import { distributedStore } from "@chatbotx.io/redis"
import { ChatbotXException, validationException } from "../errors"
import { checkSsrfSafety } from "../net/ssrf-guard"
import { findAlternateFeedUrl } from "./alternate-link"
import {
  POST_FEED_FETCH_RATE_CODE,
  POST_FEED_FETCH_UNAVAILABLE_CODE,
  POST_FEED_NOT_PARSEABLE_CODE,
  POST_FEED_UNREACHABLE_CODE,
} from "./codes"
import {
  FeedFetchError,
  type FeedFetchResult,
  registeredFeedFetcher,
} from "./fetcher"
import { MAX_POST_FEED_URL_LENGTH, POST_FEED_FETCH_PER_HOUR } from "./limits"
import { FeedParseError, parseFeed } from "./parse"

export const HOUR_SECONDS = 3600

/**
 * Counts one fetch of an outside feed address against the workspace's hourly
 * budget (save, address change, item draft). The preview and the test send have
 * budgets of their own.
 */
export async function chargeFeedFetch(workspaceId: string): Promise<void> {
  const used = await distributedStore.incrWithWindow(
    `postfeed:${workspaceId}:fetch`,
    HOUR_SECONDS,
  )
  if (used > POST_FEED_FETCH_PER_HOUR) {
    throw new ChatbotXException(
      "Too many feed address checks. Try again later.",
      POST_FEED_FETCH_RATE_CODE,
      429,
    )
  }
}

export async function assertFeedUrl(feedUrl: string): Promise<string> {
  const trimmed = feedUrl.trim()
  if (!trimmed || trimmed.length > MAX_POST_FEED_URL_LENGTH) {
    throw validationException("feedUrl", "The feed address is not valid")
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw validationException("feedUrl", "The feed address is not valid")
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw validationException(
      "feedUrl",
      "Only http and https feeds without credentials are allowed",
    )
  }
  if ((await checkSsrfSafety(parsed.toString())).unsafe) {
    throw validationException("feedUrl", "This feed address is not allowed")
  }
  return parsed.toString()
}

/** The vetted alternate feed address of an HTML page, when it names one. */
async function suggestFeedUrl(
  html: string | null,
  pageUrl: string,
): Promise<string | undefined> {
  const candidate = html ? findAlternateFeedUrl(html, pageUrl) : null
  if (!candidate || candidate === pageUrl) {
    return
  }
  return (await checkSsrfSafety(candidate)).unsafe ? undefined : candidate
}

async function toReadException(
  err: unknown,
  feedUrl: string,
): Promise<unknown> {
  if (err instanceof FeedParseError) {
    return new ChatbotXException(
      "This address is not an RSS or Atom feed.",
      POST_FEED_NOT_PARSEABLE_CODE,
      422,
    )
  }
  if (!(err instanceof FeedFetchError)) {
    return err
  }
  if (err.code === "blocked") {
    return validationException("feedUrl", "This feed address is not allowed")
  }
  if (err.code === "badContentType") {
    const exception = new ChatbotXException(
      "This address is not an RSS or Atom feed.",
      POST_FEED_NOT_PARSEABLE_CODE,
      422,
    )
    const suggestedUrl = await suggestFeedUrl(err.html, feedUrl)
    if (suggestedUrl) {
      exception.data = { suggestedUrl }
    }
    return exception
  }
  return new ChatbotXException(err.message, POST_FEED_UNREACHABLE_CODE, 422)
}

/** Fetches and parses the address with the same guarded fetcher the checks use. */
export async function readFeed(feedUrl: string) {
  const fetcher = registeredFeedFetcher()
  if (!fetcher) {
    throw new ChatbotXException(
      "Feed fetching is not available.",
      POST_FEED_FETCH_UNAVAILABLE_CODE,
      503,
    )
  }
  try {
    const fetched: FeedFetchResult = await fetcher({
      etag: null,
      lastModified: null,
      url: feedUrl,
    })
    return fetched.kind === "ok" ? await parseFeed(fetched.body) : []
  } catch (err) {
    throw await toReadException(err, feedUrl)
  }
}
