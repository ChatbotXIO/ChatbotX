import type { ArticleImageFinder } from "../social-post-feed/article-image"
import { findArticleImageUrl } from "../social-post-feed/article-meta"
import { FeedImageImportError } from "../social-post-feed/image-importer"
import {
  baseContentType,
  type GuardedGetFailure,
  guardedGet,
  withHttpsUpgrade,
} from "./guarded-get"

/**
 * Node-only (undici). Not re-exported from the package index; registered from
 * the worker and the builder's route handlers (AGENTS.md invariant 25).
 * Reads an item's article page the way feeds and pictures are read: every hop is
 * SSRF-vetted and the socket is pinned to the vetted address, no cookies or
 * credentials are ever sent, at most 2 redirects, only the first 1 MB.
 */

const OK = 200
const MAX_REDIRECTS = 2
const MAX_BYTES = 1_048_576
const HEAD_END = "</head"
const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)$/

/** Reads until the head ends, the cap is reached or the body ends; the rest is never downloaded. */
const readHead = async (
  response: Response,
  signal: AbortSignal,
): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) {
    return ""
  }
  const decoder = new TextDecoder("utf-8")
  let text = ""
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      // A server may send one chunk far larger than the cap: only the bytes still allowed are decoded.
      const allowed = Math.max(0, MAX_BYTES - total)
      const chunk =
        value.byteLength > allowed ? value.subarray(0, allowed) : value
      total += chunk.byteLength
      const scanFrom = Math.max(0, text.length - HEAD_END.length)
      text += decoder.decode(chunk, { stream: true })
      if (
        text.slice(scanFrom).toLowerCase().includes(HEAD_END) ||
        total >= MAX_BYTES
      ) {
        break
      }
    }
  } catch {
    throw new FeedImageImportError(
      signal.aborted ? "timeout" : "articleUnreachable",
      "The article page could not be read",
    )
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}

const failureOf = (failure: GuardedGetFailure): FeedImageImportError => {
  switch (failure) {
    case "notWeb":
      return new FeedImageImportError("notHttps", "Only web pages are read")
    case "blocked":
      return new FeedImageImportError(
        "blocked",
        "The page address is not allowed",
      )
    case "timeout":
      return new FeedImageImportError(
        "timeout",
        "The article page could not be reached",
      )
    case "unreachable":
      return new FeedImageImportError(
        "articleUnreachable",
        "The article page could not be reached",
      )
    case "noLocation":
      return new FeedImageImportError(
        "articleUnreachable",
        "The article page redirects nowhere",
      )
    default:
      return new FeedImageImportError(
        "articleUnreachable",
        "The article page redirects too often",
      )
  }
}

const fetchHtml = async (
  start: string,
  signal: AbortSignal,
): Promise<{ finalUrl: string; html: string }> => {
  const { finalUrl, response } = await guardedGet({
    fail: failureOf,
    headers: {
      accept: "text/html, application/xhtml+xml;q=0.9",
      "user-agent": "ChatbotX-feed-article/1.0",
    },
    maxRedirects: MAX_REDIRECTS,
    signal,
    start,
  })
  if (response.status !== OK) {
    await response.body?.cancel().catch(() => undefined)
    throw new FeedImageImportError(
      "articleUnreachable",
      `The article page answered with status ${response.status}`,
    )
  }
  if (!HTML_TYPE.test(baseContentType(response.headers.get("content-type")))) {
    await response.body?.cancel().catch(() => undefined)
    throw new FeedImageImportError(
      "articleNoImage",
      "The article address is not a web page",
    )
  }
  return { finalUrl, html: await readHead(response, signal) }
}

/** Only a failure http could change is retried over http (a policy refusal would be refused again). */
const canRetryOverHttp = (error: unknown): boolean =>
  !(error instanceof FeedImageImportError && error.code === "blocked")

const fetchWithUpgrade = async (
  url: string,
  signal: AbortSignal,
): Promise<{ finalUrl: string; html: string }> =>
  await withHttpsUpgrade(
    url,
    (candidate) => fetchHtml(candidate, signal),
    canRetryOverHttp,
  )

export const findFeedArticleImage: ArticleImageFinder = async (input) => {
  const { finalUrl, html } = await fetchWithUpgrade(input.url, input.signal)
  return findArticleImageUrl(html, finalUrl)
}
