import type { SocialPostFeedErrorCode } from "@chatbotx.io/database/partials"

/**
 * Fetching a feed needs a socket pinned to the addresses the SSRF guard vetted,
 * which is Node-only (undici). The business package is reached by the
 * builder's Edge-traced router graph and must stay free of Node imports
 * (AGENTS.md invariant 25), so the fetcher is injected: the worker and the
 * builder's Node route handlers register theirs at start-up
 * (`net/feed-fetch.ts`). A process that registered none refuses to fetch
 * instead of falling back to an unpinned request.
 */

/** A fetch that did not produce a document; `code` is safe to show the owner. */
export class FeedFetchError extends Error {
  readonly code: SocialPostFeedErrorCode
  /** The body of an HTML answer (capped), kept so a save can suggest the feed the page advertises. */
  readonly html: string | null

  constructor(
    code: SocialPostFeedErrorCode,
    message: string,
    html: string | null = null,
  ) {
    super(message)
    this.name = "FeedFetchError"
    this.code = code
    this.html = html
  }
}

export type FeedFetchInput = {
  /** Validators of the last good response; sent as a conditional GET. */
  etag: string | null
  lastModified: string | null
  url: string
}

export type FeedFetchResult =
  | { kind: "notModified" }
  | {
      body: string
      etag: string | null
      kind: "ok"
      lastModified: string | null
    }

/**
 * GETs the feed. Every hop is vetted by the SSRF guard and the socket connects
 * only to the vetted address; at most 3 redirects, 10 s in all, 2 MB of body.
 * Throws `FeedFetchError`.
 */
export type FeedFetcher = (input: FeedFetchInput) => Promise<FeedFetchResult>

let registered: FeedFetcher | null = null

export const registerFeedFetcher = (fetcher: FeedFetcher): void => {
  registered = fetcher
}

export const registeredFeedFetcher = (): FeedFetcher | null => registered
