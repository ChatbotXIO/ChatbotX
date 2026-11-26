/**
 * Reading an article page for its og:image needs a socket pinned to vetted
 * addresses (Node-only), so the finder is injected exactly like the image
 * importer (the worker and the builder's Node route handlers register it from
 * `net/feed-article-image.ts`; AGENTS.md invariant 25). A process that
 * registered none reads no article pages: the item simply has no article picture.
 */

export type ArticleImageFinderInput = {
  signal: AbortSignal
  /** The item's link. */
  url: string
}

/**
 * Fetches the article page (https; http only when an https upgrade failed; at
 * most 2 redirects; 1 MB; no cookies) and returns the absolute address its
 * `og:image` / `twitter:image` names, or null when it names none. Throws a
 * `FeedImageImportError` when the page cannot be read.
 */
export type ArticleImageFinder = (
  input: ArticleImageFinderInput,
) => Promise<string | null>

let registered: ArticleImageFinder | null = null

export const registerFeedArticleImageFinder = (
  finder: ArticleImageFinder,
): void => {
  registered = finder
}

export const registeredFeedArticleImageFinder = (): ArticleImageFinder | null =>
  registered
