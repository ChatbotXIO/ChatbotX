import {
  socialPostFeedRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import { distributedStore } from "@chatbotx.io/redis"
import { FeedTemplateError } from "@chatbotx.io/utils/feed-template"
import { normalisePublishTarget } from "@chatbotx.io/utils/post-publishing"
import { ChatbotXException } from "../errors"
import { requestHash } from "../social-post/hash"
import { POST_FEED_PREVIEW_RATE_CODE } from "./codes"
import { renderFeedTemplate } from "./compose"
import { pictureCandidates } from "./feed-media"
import { assertFeedUrl, HOUR_SECONDS, readFeed } from "./feed-read"
import { partitionDestinations, resolveFeedShape } from "./feed-shape"
import { FEED_FIELD_FORMAT_VERSION } from "./fields"
import { evaluateItemFilters } from "./item-filter"
import {
  DEFAULT_POST_FEED_TEMPLATE_V2,
  POST_FEED_PREVIEW_CACHE_SECONDS,
  POST_FEED_PREVIEW_DRAFTS_PER_HOUR,
  POST_FEED_PREVIEW_ITEMS,
  POST_FEED_PREVIEW_PER_HOUR,
} from "./limits"
import type { ParsedFeedItem } from "./parse"
import { renderProviderTexts } from "./provider-texts"
import { assertProviderTemplateShape } from "./template-check"
import { FEED_TEMPLATE_VARIABLES } from "./template-data"
import type {
  PostFeedPreview,
  PostFeedPreviewConfig,
  PostFeedPreviewRender,
} from "./types"

/** The content type a preview checks a destination against, for the post's shape. */
const previewContentType = (
  shape: "photo" | "link" | "text" | "skip",
  provider: string,
): "image" | "link" | "text" => {
  if (shape === "photo") {
    return "image"
  }
  return shape === "link" && provider === "facebook" ? "link" : "text"
}

/** A cached preview item: `publishedAt` travels as text. */
type StoredPreviewItem = Omit<ParsedFeedItem, "publishedAt"> & {
  publishedAt: string | null
}

/**
 * Fetches and parses a feed without storing anything. 10 previews per hour per
 * workspace. Returns what was detected in each item (the variables and the raw
 * fields a template can read) and, when a draft configuration is given, what
 * that configuration would do with each item. ADVISORY: nothing is imported or
 * stored, and the worker re-validates every post when it creates it.
 */
export async function preview(
  input: { feedUrl: string; workspaceId: string } & PostFeedPreviewConfig,
): Promise<PostFeedPreview> {
  const feedUrl = await assertFeedUrl(input.feedUrl)
  const items = await previewItems(feedUrl, input.workspaceId)
  const draft = await previewDraft(input)
  return {
    fieldFormatVersion: FEED_FIELD_FORMAT_VERSION,
    items: items.slice(0, POST_FEED_PREVIEW_ITEMS).map((item) => ({
      author: item.author,
      categories: item.categories,
      fields: item.fields,
      image: item.image,
      images: item.images,
      itemKey: item.itemKey,
      link: item.link,
      publishedAt: item.publishedAt,
      render: draft ? draft(item) : null,
      summary: item.summary,
      title: item.title,
    })),
    variables: [...FEED_TEMPLATE_VARIABLES],
  }
}

/**
 * The first items of a feed for a preview. The parsed items are kept for two
 * minutes, so the editor can re-render a draft template as it is typed without
 * fetching the feed again; only a real fetch counts against the 10 per hour,
 * and drafts rendered from the kept items have a larger limit of their own.
 */
async function previewItems(
  feedUrl: string,
  workspaceId: string,
): Promise<ParsedFeedItem[]> {
  const cacheKey = `postfeed:${workspaceId}:previewitems:${await requestHash(feedUrl)}`
  const cached = await distributedStore.get<StoredPreviewItem[]>(cacheKey)
  if (cached) {
    const rendered = await distributedStore.incrWithWindow(
      `postfeed:${workspaceId}:previewdraft`,
      HOUR_SECONDS,
    )
    if (rendered > POST_FEED_PREVIEW_DRAFTS_PER_HOUR) {
      throw new ChatbotXException(
        "Too many feed previews. Try again later.",
        POST_FEED_PREVIEW_RATE_CODE,
        429,
      )
    }
    return cached.map((item) => ({
      ...item,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    }))
  }
  const used = await distributedStore.incrWithWindow(
    `postfeed:${workspaceId}:preview`,
    HOUR_SECONDS,
  )
  if (used > POST_FEED_PREVIEW_PER_HOUR) {
    throw new ChatbotXException(
      "Too many feed previews. Try again later.",
      POST_FEED_PREVIEW_RATE_CODE,
      429,
    )
  }
  const items = (await readFeed(feedUrl)).slice(0, POST_FEED_PREVIEW_ITEMS)
  await distributedStore.put(cacheKey, items, POST_FEED_PREVIEW_CACHE_SECONDS)
  return items
}

/** A function that applies the draft configuration to one item; null when none was given. */
async function previewDraft(
  input: { workspaceId: string } & PostFeedPreviewConfig,
): Promise<((item: ParsedFeedItem) => PostFeedPreviewRender) | null> {
  if (input.textTemplate === undefined && input.postAs === undefined) {
    return null
  }
  const { workspaceId } = input
  const syntax = input.templateSyntax ?? "v2"
  const template = input.textTemplate ?? DEFAULT_POST_FEED_TEMPLATE_V2
  const ownTemplates = input.templatesByProvider ?? {}
  // A draft is held to the shape rules of a save; a template that does not parse is reported in the result.
  assertProviderTemplateShape(syntax, ownTemplates)
  const found = input.destinationIds?.length
    ? await socialPostRepository.findDestinations({
        ids: input.destinationIds,
        workspaceId,
      })
    : []
  const destinations = found.map((destination) => ({
    id: destination.id,
    provider: destination.provider,
  }))
  const timeZone =
    await socialPostFeedRepository.findWorkspaceTimezone(workspaceId)
  const config = {
    mediaField: input.mediaField ?? null,
    mediaMode: input.mediaMode ?? "auto",
    templateSyntax: syntax,
  } as const
  const now = new Date()
  return (item) => {
    const pictures = pictureCandidates(config, item, timeZone)
    // The article page is only read by a real check; the preview assumes it may name a picture.
    const articleImageWillBeTried =
      Boolean(input.fetchArticleImage) &&
      config.mediaMode !== "none" &&
      pictures.length === 0
    const shape = resolveFeedShape({
      hasImage:
        pictures.length > 0 ||
        articleImageWillBeTried ||
        (input.mediaLibraryFileIds?.length ?? 0) > 0,
      noImageFallback: input.noImageFallback ?? "link",
      postAs: input.postAs ?? "photo",
    })
    const verdict = evaluateItemFilters(input.filters, item, {
      hasImage: pictures.length > 0,
      now,
    })
    let text = ""
    let templateProblem: PostFeedPreviewRender["templateProblem"] = null
    try {
      text = renderFeedTemplate({
        image: pictures[0]?.url ?? null,
        item,
        syntax,
        template,
        timeZone,
      })
    } catch (error) {
      if (!(error instanceof FeedTemplateError)) {
        throw error
      }
      templateProblem = {
        code: error.code,
        column: error.column,
        line: error.line,
        message: error.message,
      }
    }
    const providerTexts = renderProviderTexts({
      image: pictures[0]?.url ?? null,
      item,
      templates: ownTemplates,
      timeZone,
    })
    const { dropped, kept } =
      shape === "skip"
        ? { dropped: destinations, kept: [] }
        : partitionDestinations(destinations, shape)
    const networks = kept.map((destination) => {
      const own = providerTexts.find(
        (entry) =>
          entry.provider === destination.provider &&
          !entry.templateProblem &&
          entry.text !== text,
      )
      const networkText = own ? own.text : text
      const normalised = normalisePublishTarget({
        contentType: previewContentType(shape, destination.provider),
        linkUrl: shape === "link" ? item.link : null,
        media:
          shape === "photo"
            ? [
                {
                  durationMs: null,
                  kind: "image",
                  mimeType: "image/jpeg",
                  size: null,
                },
              ]
            : [],
        options: {},
        provider: destination.provider,
        text: networkText,
      })
      return {
        characters: Array.from(networkText).length,
        issues: normalised.issues.map(({ code, message }) => ({
          code,
          message,
        })),
        provider: destination.provider,
        text: networkText,
        usesOwnTemplate: Boolean(own),
      }
    })
    return {
      articleImageWillBeTried,
      droppedDestinationIds: dropped.map((destination) => destination.id),
      filteredBy: verdict.pass ? null : verdict.reason,
      networks,
      pictures,
      providerTexts,
      shape,
      templateProblem,
      text,
    }
  }
}
