import type {
  SocialPostFeedImageError,
  SocialPostFeedImageSource,
} from "@chatbotx.io/database/partials"
import type { SocialPostFeedRow } from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../logger"
import { mediaLibraryService } from "../media-library/service"
import { mediaLibraryFileService } from "../media-library-file/service"
import { requestHash } from "../social-post/hash"
import { registeredFeedArticleImageFinder } from "./article-image"
import { renderFeedTemplate } from "./compose"
import {
  FeedImageImportError,
  registeredFeedImageImporter,
} from "./image-importer"
import type { FeedImageCandidate } from "./images"
import type { FeedTemplateSource } from "./template-data"
import { safeLink } from "./text"

const IMPORT_TIMEOUT_MS = 10_000
/** Time one article page read may take (redirects included). */
const ARTICLE_TIMEOUT_MS = 10_000
/** Pictures of one item tried before the item goes without. */
const MAX_CANDIDATES_TRIED = 2
/** Import attempts one run spends on a single host. */
const MAX_ATTEMPTS_PER_DOMAIN = 3

export type FeedImageSourceKind = SocialPostFeedImageSource

export type FeedItemPicture = { source: FeedImageSourceKind; url: string }

/** The pictures an item may use under the feed's media mode, best first (no download). */
export const pictureCandidates = (
  feed: Pick<SocialPostFeedRow, "mediaField" | "mediaMode" | "templateSyntax">,
  item: FeedTemplateSource & { images: readonly FeedImageCandidate[] },
  timeZone: string,
): FeedItemPicture[] => {
  if (feed.mediaMode === "none") {
    return []
  }
  if (feed.mediaMode === "auto") {
    return item.images.map((image) => ({
      source: image.source,
      url: image.url,
    }))
  }
  if (!feed.mediaField) {
    return []
  }
  try {
    // The picture field is written in the feed's template language.
    const rendered = renderFeedTemplate({
      item,
      syntax: feed.templateSyntax,
      template: feed.mediaField,
      timeZone,
    }).split("\n")[0]
    const url = safeLink(rendered?.trim() || null)
    return url ? [{ source: "field", url }] : []
  } catch {
    return []
  }
}

/** Spend limits of one run: total attempts and attempts per host. */
export class ImageBudget {
  private remaining: number
  private articleReads: number
  private readonly domainLimit: number
  private readonly perDomain = new Map<string, number>()

  /**
   * `articleReads`: article pages one run may read (the feed's per-check item limit); 0 reads none.
   * `domainLimit`: attempts on one host (default 3).
   */
  constructor(
    attempts: number,
    articleReads = 0,
    domainLimit = MAX_ATTEMPTS_PER_DOMAIN,
  ) {
    this.remaining = attempts
    this.articleReads = articleReads
    this.domainLimit = domainLimit
  }

  private spend(url: string): boolean {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return false
    }
    const used = this.perDomain.get(host) ?? 0
    if (this.remaining <= 0 || used >= this.domainLimit) {
      return false
    }
    this.remaining -= 1
    this.perDomain.set(host, used + 1)
    return true
  }

  /** True when an attempt may be made now (and counts it). */
  take(url: string): boolean {
    return this.spend(url)
  }

  /** True when one article page may be read now: within the run's reads and the host's attempts (shared with its pictures). */
  takeArticle(url: string): boolean {
    if (this.articleReads <= 0 || !this.spend(url)) {
      return false
    }
    this.articleReads -= 1
    return true
  }
}

export type FeedMediaResult = {
  /** True when this call stored the file (so a failed post may remove it again). */
  created: boolean
  fileId: string | null
  imageError: SocialPostFeedImageError | null
  imageSource: FeedImageSourceKind | null
  /** The address the picture was taken from (not set for a library picture). */
  imageUrl: string | null
}

const NO_MEDIA: FeedMediaResult = {
  created: false,
  fileId: null,
  imageError: null,
  imageSource: null,
  imageUrl: null,
}

const TEST_PATH_MARKER = "-test-"
const TEST_PATH_PATTERN = /\/media-library\/feed-[^/]*-test-[^/]+$/

/** Whether a stored path is a "Send test" picture (a random path no run ever shares). */
export const isFeedTestImagePath = (path: string): boolean =>
  TEST_PATH_PATTERN.test(path)

/**
 * One stable storage path per feed item: a retry (a lost lease, a failed
 * transaction) finds the file already imported and reuses its library id, so the
 * post's idempotency hash does not change between attempts.
 */
export const stableImagePath = async (input: {
  feedId: string
  itemKey: string
  /** A "Send test" picture gets its own path so it never shares an object with the real run. */
  purpose?: "post" | "test"
  workspaceId: string
}): Promise<string> => {
  const hash = (await requestHash(input.itemKey)).slice(0, 32)
  const suffix =
    input.purpose === "test" ? `${TEST_PATH_MARKER}${createId()}` : ""
  return `public/space/${input.workspaceId}/media-library/feed-${input.feedId}-${hash}${suffix}`
}

const IMAGE_PREFIX = "image/"

/** A fixed library picture chosen by the item's key, so a feed with several rotates them. */
const libraryPicture = async (
  feed: Pick<SocialPostFeedRow, "mediaLibraryFileIds" | "workspaceId">,
  itemKey: string,
): Promise<string | null> => {
  const ids = feed.mediaLibraryFileIds
  if (ids.length === 0) {
    return null
  }
  const start =
    Number.parseInt((await requestHash(itemKey)).slice(0, 8), 16) % ids.length
  for (let step = 0; step < ids.length; step++) {
    const id = ids[(start + step) % ids.length] as string
    const file = await mediaLibraryFileService.findById({
      id,
      workspaceId: feed.workspaceId,
    })
    if (file?.mimeType.startsWith(IMAGE_PREFIX)) {
      return file.id
    }
  }
  return null
}

/**
 * The picture an article page names (`og:image` / `twitter:image`), read once
 * for an item that names none. Never throws: a page that cannot be read, a
 * spent budget or a page with no picture come back as the ledger's error code,
 * and the item goes on to the feed's fallback.
 */
const readArticlePicture = async (
  articleUrl: string,
  budget: ImageBudget,
): Promise<
  | { error: null; picture: FeedItemPicture }
  | { error: SocialPostFeedImageError; picture: null }
> => {
  const finder = registeredFeedArticleImageFinder()
  if (!finder) {
    return { error: "unsupported", picture: null }
  }
  if (!budget.takeArticle(articleUrl)) {
    return { error: "budget", picture: null }
  }
  try {
    const url = await finder({
      signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
      url: articleUrl,
    })
    return url
      ? { error: null, picture: { source: "article", url } }
      : { error: "articleNoImage", picture: null }
  } catch (error) {
    if (!(error instanceof FeedImageImportError)) {
      logger.warn({ err: error }, "social-post feed: article page read failed")
    }
    return {
      error:
        error instanceof FeedImageImportError
          ? error.code
          : "articleUnreachable",
      picture: null,
    }
  }
}

/**
 * Imports the item's picture into the Media Library BEFORE the ledger and post
 * transaction, so no download happens while it is open. The result is only a
 * library file id. A picture that cannot be used never blocks the post: the
 * error is returned for the ledger and the next candidate, then the feed's
 * library pictures, are tried.
 */
export const acquireFeedMedia = async (input: {
  budget: ImageBudget
  candidates: readonly FeedItemPicture[]
  /** The item's link: the article page read for a picture when `feed.fetchArticleImage` is on and the item names none. */
  articleUrl?: string | null
  feed: Pick<
    SocialPostFeedRow,
    "id" | "mediaLibraryFileIds" | "mediaMode" | "workspaceId"
  > & { fetchArticleImage?: boolean }
  itemKey: string
  purpose?: "post" | "test"
}): Promise<FeedMediaResult> => {
  const { feed } = input
  if (feed.mediaMode === "none") {
    return NO_MEDIA
  }
  const path = await stableImagePath({
    feedId: feed.id,
    itemKey: input.itemKey,
    purpose: input.purpose,
    workspaceId: feed.workspaceId,
  })
  const [first] = input.candidates
  const mayReadArticle = Boolean(feed.fetchArticleImage && input.articleUrl)
  if ((first || mayReadArticle) && input.purpose !== "test") {
    const existing = await mediaLibraryFileService.findByPath({
      path,
      workspaceId: feed.workspaceId,
    })
    if (existing) {
      // A retry finds the file a previous attempt stored (an article page is not read again).
      return {
        ...NO_MEDIA,
        fileId: existing.id,
        imageSource: first?.source ?? "article",
        imageUrl: first?.url ?? null,
      }
    }
  }
  let imageError: SocialPostFeedImageError | null = null
  const importer = registeredFeedImageImporter()
  let candidates: readonly FeedItemPicture[] = input.candidates
  if (candidates.length === 0 && mayReadArticle && input.articleUrl) {
    const article = await readArticlePicture(input.articleUrl, input.budget)
    if (article.picture) {
      candidates = [article.picture]
    } else {
      imageError = article.error
    }
  }
  const [firstCandidate] = candidates
  for (const candidate of candidates.slice(0, MAX_CANDIDATES_TRIED)) {
    if (!importer) {
      imageError = "unsupported"
      break
    }
    if (!input.budget.take(candidate.url)) {
      imageError = "budget"
      continue
    }
    try {
      const imported = await importer({
        path,
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
        url: candidate.url,
      })
      // A concurrent import of the same stable path may have registered it already: reuse that row.
      const raced =
        input.purpose === "test"
          ? null
          : await mediaLibraryFileService.findByPath({
              path,
              workspaceId: feed.workspaceId,
            })
      if (raced) {
        return {
          ...NO_MEDIA,
          fileId: raced.id,
          imageSource: candidate.source,
          imageUrl: candidate.url,
        }
      }
      let file: { id: string }
      try {
        file = await mediaLibraryService.createFile({
          mimeType: imported.mimeType,
          name: imported.name,
          path,
          size: imported.size,
          workspaceId: feed.workspaceId,
        })
      } catch (error) {
        await mediaLibraryService.deleteObjectIfUnreferenced({
          path,
          workspaceId: feed.workspaceId,
        })
        throw error
      }
      return {
        created: true,
        fileId: file.id,
        imageError: null,
        imageSource: candidate.source,
        imageUrl: candidate.url,
      }
    } catch (error) {
      imageError =
        error instanceof FeedImageImportError ? error.code : "storage"
      if (!(error instanceof FeedImageImportError)) {
        logger.warn(
          { err: error, feedId: feed.id },
          "social-post feed: picture import failed",
        )
      }
    }
  }
  const libraryId = await libraryPicture(feed, input.itemKey)
  if (libraryId) {
    return {
      created: false,
      fileId: libraryId,
      imageError,
      imageSource: "library",
      imageUrl: null,
    }
  }
  return {
    ...NO_MEDIA,
    imageError,
    imageUrl: firstCandidate?.url ?? null,
    imageSource: firstCandidate?.source ?? null,
  }
}

/**
 * Removes the Media Library ROW of a file this run imported when no post uses
 * it; a file a concurrent run's post uses is kept (the delete would null that
 * post's media link). The row is locked `FOR UPDATE` and checked for
 * references in one transaction, and a concurrent post insert takes a
 * `FOR KEY SHARE` lock through the foreign key, so it either commits first
 * (seen, nothing deleted) or fails the foreign key and that run retries.
 *
 * The storage object of a real feed picture is never deleted: its path is
 * stable per feed and item, so a concurrent or later import re-uses or
 * overwrites the same object, and a left-over one is bounded (one per item).
 * Only a "Send test" picture (its own random path) has its object deleted,
 * after the commit. Never throws.
 */
export const discardImportedFile = async (input: {
  fileId: string
  workspaceId: string
}): Promise<void> => {
  try {
    await mediaLibraryService.deleteFileUnlessUsedByPosts({
      ...input,
      shouldDeleteObject: isFeedTestImagePath,
    })
  } catch (error) {
    logger.warn(
      { err: error, fileId: input.fileId },
      "social-post feed: failed to remove an unused picture",
    )
  }
}
