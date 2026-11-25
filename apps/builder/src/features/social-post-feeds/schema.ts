import {
  MAX_BULK_DELETE_POST_FEEDS as BULK_DELETE_MAX,
  POST_FEED_ITEMS_PAGE_SIZE_DEFAULT as ITEMS_PAGE_DEFAULT,
  POST_FEED_ITEMS_PAGE_SIZE_MAX as ITEMS_PAGE_MAX,
  MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH as MAX_AI_INSTRUCTIONS_LENGTH,
  MAX_POST_FEED_DAILY_CAP as MAX_DAILY_CAP,
  MAX_DESTINATIONS_PER_POST_FEED as MAX_DESTINATIONS,
  MAX_FEED_FALLBACK_IMAGES,
  MAX_POST_FEED_INTERVAL_MINUTES as MAX_INTERVAL_MINUTES,
  MAX_POST_FEED_ITEMS_PER_RUN as MAX_ITEMS_PER_RUN,
  MAX_POST_FEED_NAME_LENGTH as MAX_NAME_LENGTH,
  MAX_POST_FEED_TEMPLATE_LENGTH as MAX_TEMPLATE_LENGTH,
  MAX_POST_FEED_URL_LENGTH as MAX_URL_LENGTH,
  MIN_POST_FEED_INTERVAL_MINUTES as MIN_INTERVAL_MINUTES,
  socialPostFeedErrorCodes,
  socialPostFeedFilters,
  socialPostFeedImageSources,
  socialPostFeedItemOutcomes,
  socialPostFeedMediaModes,
  socialPostFeedModes,
  socialPostFeedNoImageFallbacks,
  socialPostFeedPostAs,
  socialPostFeedRunSummary,
  socialPostFeedStatuses,
  socialPostFeedTemplateSyntaxes,
  socialPostFeedTemplatesByProvider,
  socialProviders,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const feedName = z.string().trim().min(1).max(MAX_NAME_LENGTH)
const feedUrl = z.string().trim().min(1).max(MAX_URL_LENGTH)
const textTemplate = z.string().min(1).max(MAX_TEMPLATE_LENGTH)
const destinationIds = z
  .array(zodBigintIdAsString())
  .min(1)
  .max(MAX_DESTINATIONS)

export const postFeedResource = z.object({
  aiInstructions: z.string().nullable(),
  aiIntegrationId: z.string().nullable(),
  aiModel: z.string().nullable(),
  aiWrite: z.boolean(),
  consecutiveFailures: z.number(),
  createdAt: z.date(),
  dailyCap: z.number(),
  destinationIds: z.array(z.string()),
  feedUrl: z.string(),
  fetchArticleImage: z.boolean(),
  filters: socialPostFeedFilters.nullable(),
  id: z.string(),
  intervalMinutes: z.number(),
  lastCheckedAt: z.date().nullable(),
  lastErrorCode: socialPostFeedErrorCodes.nullable(),
  lastRunSummary: socialPostFeedRunSummary
    .nullable()
    .describe(
      "What the last check did: `kind` (`checked`, `notModified`, `stale` = the source returned an older copy than already seen, nothing was written and the check repeats within about 2 minutes (at most 3 times in a row), `failed`), `items` returned, `fresh` new items, `created` posts, `refused` items the platform refused, `waiting` new items left for the next check, `waitingReason` (why they wait: `dailyCap`, `runLimit`, `attempts`, `timeBudget`, `pictureBudget`; absent on older rows), `dailyCap` and `nextSlotAt` (with reason `dailyCap`: the rolling 24 h cap and when a place frees up, ISO 8601), `staleRetries`. Null before the first check.",
    ),
  maxItemsPerRun: z.number(),
  mediaField: z.string().nullable(),
  mediaLibraryFileIds: z.array(z.string()),
  mediaMode: socialPostFeedMediaModes,
  mode: socialPostFeedModes,
  name: z.string(),
  nextCheckAt: z.date(),
  noImageFallback: socialPostFeedNoImageFallbacks,
  postAs: socialPostFeedPostAs,
  postLatestOnFirstCheck: z.boolean(),
  primed: z.boolean(),
  signatureId: z.string().nullable(),
  startedAt: z.date(),
  status: socialPostFeedStatuses,
  templateSyntax: socialPostFeedTemplateSyntaxes,
  templatesByProvider: socialPostFeedTemplatesByProvider,
  textTemplate: z.string(),
})

export const postFeedIdRequest = z.strictObject({
  id: zodBigintIdAsString().describe("Feed id. Get it from `postFeeds.list`."),
})

export const bulkDeletePostFeedsRequest = z
  .object({
    ids: z
      .array(zodBigintIdAsString())
      .min(1)
      .max(BULK_DELETE_MAX)
      .describe("Feed ids, 1 to 100. Get them from `postFeeds.list`."),
  })
  .strict()

export const bulkDeletePostFeedsResponse = z.object({
  deletedIds: z
    .array(z.string())
    .describe("Ids of the feeds that were deleted."),
  notFoundIds: z
    .array(z.string())
    .describe(
      "Ids that are not feeds of this workspace; nothing was changed for them.",
    ),
})

const MAX_FILTER_VALUES = 10
const MAX_SEARCH_LENGTH = 200

/** A lone `?x=a` stays a string in query parsing; wrap it so it reads as a list. */
const queryArray = <Item extends z.ZodType>(item: Item) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(MAX_FILTER_VALUES),
  )

export const listPostFeedsRequest = z.strictObject({
  destinationIds: queryArray(zodBigintIdAsString())
    .optional()
    .describe(
      "Only feeds that post to at least one of these destinations (`publishDestinations.list`), up to 10.",
    ),
  mode: queryArray(socialPostFeedModes)
    .optional()
    .describe("Only feeds in these modes: `draft`, `queue`."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SEARCH_LENGTH)
    .optional()
    .describe(
      "Case-insensitive text matched against the feed name and the feed address.",
    ),
  status: queryArray(socialPostFeedStatuses)
    .optional()
    .describe("Only feeds in these statuses: `active`, `paused`, `error`."),
})

export type ListPostFeedsInput = z.output<typeof listPostFeedsRequest>

export const listPostFeedsResponse = z.object({
  items: z.array(postFeedResource),
})

const feedSettings = {
  aiInstructions: z
    .string()
    .max(MAX_AI_INSTRUCTIONS_LENGTH)
    .nullable()
    .describe(
      "Extra wording for the AI writer, at most 300 characters (untrusted text, sent to the model as data). Only used when `aiWrite` is true.",
    ),
  aiIntegrationId: z
    .string()
    .min(1)
    .max(40)
    .nullable()
    .describe(
      "The AI integration to write with (a provider name such as `openai`, or the id of an OpenAI-compatible integration). Give it with `aiModel`, or neither: the model chosen for Inbox translation is then used. Must belong to the workspace (422 `validation` on `aiIntegrationId` otherwise).",
    ),
  aiModel: z
    .string()
    .min(1)
    .max(200)
    .nullable()
    .describe("The model of `aiIntegrationId`."),
  aiWrite: z
    .boolean()
    .describe(
      "When true, each new item's post text is written by AI from its title, summary and link (one shared text for every network, cut to the shortest network limit; counts against the workspace's AI limits). If the AI cannot write it the text template is used and the item's `reason` is `aiFallback`; the feed is never blocked. Default false.",
    ),
  postLatestOnFirstCheck: z
    .boolean()
    .describe(
      "When true, the first check makes a post from the newest item only (the others are recorded as before). Default false.",
    ),
  dailyCap: z
    .number()
    .int()
    .min(1)
    .max(MAX_DAILY_CAP)
    .describe("Most posts the feed creates per rolling 24 hours. Default 10."),
  intervalMinutes: z
    .number()
    .int()
    .min(MIN_INTERVAL_MINUTES)
    .max(MAX_INTERVAL_MINUTES)
    .describe("Minutes between checks, 15 to 1440. Default 60."),
  maxItemsPerRun: z
    .number()
    .int()
    .min(1)
    .max(MAX_ITEMS_PER_RUN)
    .describe(
      "Most posts one check creates; further new items of that check are not recorded and wait for the next check (while they are still young). Default 5.",
    ),
  mode: socialPostFeedModes.describe(
    "`draft` (default) keeps each new item as a draft for a person to review; `queue` schedules it on each destination's next free posting slot and publishes it without review.",
  ),
  signatureId: zodBigintIdAsString()
    .nullable()
    .describe(
      "A `signature` snippet (`postSnippets.list`) appended to every post's text.",
    ),
  textTemplate: textTemplate.describe(
    'The post text, at most 5000 characters, written in the language named by `templateSyntax`. Template language (`v2`): `{{ title }}`, `{{ link }}`, `{{ summary }}`, `{{ content }}` (the item\'s text, plain), `{{ author }}`, `{{ categories }}`, `{{ date }}`, `{{ image }}`, `{{ feed.title }}`, `{{ feed.link }}`, `{{ site }}` and any feed field as `{{ raw["g:price"] }}` (element `ns:name`, attribute `ns:name@attr`, repeated `name[1]`, list `name[]`; `postFeeds.preview` lists the keys of real items). Filters: `{{ title | truncate: 100 }}` (word-safe, ends with …), `{{ categories | hashtags: 5 }}` (`#CamelCase`, accents kept, no repeats), `{{ date | date: "%d/%m/%Y" }}` (workspace time zone; `%Y %y %m %d %e %H %M %S %B %b %A %a`), `default: "x"`, `strip_html`, `upcase`, `downcase`, `capitalize`, `replace: "a", "b"`, `remove_utm`, `first`, `last`, `join: ", "`, `size`. Conditions: `{{#if image}}…{{else}}…{{/if}}` with `{{#if categories contains "Sale"}}`, `==`, `!=`, `not`. A template that does not parse answers 422 `templateInvalid` with `data.line` and `data.column`. Default `{{ title }}` then `{{ link }}`. The old `{title}` tokens still work in a feed whose `templateSyntax` is `legacy`.',
  ),
  templateSyntax: socialPostFeedTemplateSyntaxes.describe(
    '`v2` (default for new feeds) is the template language above; `legacy` is the old `{title}`/`{link}`/`{summary}` replacement, kept for feeds created before it existed. A `legacy` feed keeps rendering as before until you send a converted `textTemplate` together with `templateSyntax: "v2"`.',
  ),
  templatesByProvider: socialPostFeedTemplatesByProvider.describe(
    "Text per network instead of `textTemplate`: an object keyed by `facebook`, `instagram`, `threads`, `tiktok` (no other key), each value a `v2` template of at most 5000 characters written in the same language, with the same fields and filters. A network without an entry uses `textTemplate`. Needs `templateSyntax: \"v2\"` (422 `validation` on `templatesByProvider` for a `legacy` feed); a template that does not parse answers 422 `templateInvalid` with `data.field` `templatesByProvider.<network>`. The platform's publishing rules stay the authority: a text a network refuses is recorded as `skippedInvalid`, never shortened. A network's text is stored as that target's own text only when it differs from the shared text. AI writing (`aiWrite`) stays ONE shared text for every network, so network templates are not used for AI-written posts (the rendered shared template is the AI brief). `{}` = none.",
  ),
  fetchArticleImage: z
    .boolean()
    .describe(
      "When true and an item names no picture of its own, the item's article page (its link) is read once for its `og:image` / `twitter:image` and that picture goes through the normal picture import (`imageSource` `article`). Only for items that will actually be posted (after filters and the per-check and daily limits), https only (an http link is tried over https first), through the platform's address checks, at most 2 redirects, 1 MB read, 10 seconds, no cookies; at most one page per posted item per check and 3 attempts per host. A page that cannot be read or names no picture never blocks the post: the item's `imageError` says why (`articleUnreachable`, `articleNoImage`, `blocked`, `timeout`, `budget`) and the feed's `noImageFallback` applies. Ignored with `mediaMode: none` or `postAs` other than `photo`. Default false.",
    ),
  mediaMode: socialPostFeedMediaModes.describe(
    "Where post pictures come from: `auto` (default for new feeds) the picture the feed names for the item (image enclosure, `media:content`, `media:thumbnail`, `itunes:image`, the first `<img>` of the text, JSON Feed `image`); `field` the address your `mediaField` template yields; `none` no picture. Every picture is downloaded over https through the platform's address checks, decoded and re-encoded (JPEG, or PNG with transparency, at most 2048 px, metadata removed), stored in the Media Library and attached; one that cannot be used never blocks the post (the item's `imageError` says why).",
  ),
  mediaField: z
    .string()
    .max(MAX_TEMPLATE_LENGTH)
    .nullable()
    .describe(
      'With `mediaMode: field`: a template in the same language that yields the picture address, e.g. `{{ image }}`, `{{ raw["media:content@url"] }}` or `https://cdn.example.com/{{ raw["g:id"] }}.jpg`.',
    ),
  mediaLibraryFileIds: z
    .array(zodBigintIdAsString())
    .max(MAX_FEED_FALLBACK_IMAGES)
    .describe(
      "Media Library pictures (`mediaLibrary.listFiles`) used when an item has no usable picture of its own (rotated by item). Ignored with `mediaMode: none`.",
    ),
  postAs: socialPostFeedPostAs.describe(
    "The shape of each post: `photo` (default for new feeds) attaches the picture; `link` shares the item's link (a link preview on Facebook); `text` is text only. A destination that cannot carry the shape (Instagram needs a picture; TikTok takes video only) is left out of that item's post and listed in the item's `droppedDestinationIds`; when none is left the item is recorded as skipped.",
  ),
  noImageFallback: socialPostFeedNoImageFallbacks.describe(
    "With `postAs: photo`, what an item without a usable picture becomes: `link` (default for new feeds), `text`, or `skip` (recorded as `skippedNoImage`).",
  ),
  filters: socialPostFeedFilters
    .nullable()
    .describe(
      "Which items become posts: `includeAny` (at least one keyword), `excludeAny` (none), `categoriesAny`, `requireImage`, `maxAgeHours`. Keywords match title, summary and categories ignoring case and accents. An item the filters drop is recorded for good as `skippedFiltered` (reason `excludedKeyword`, `missingKeyword`, `category`, `noImage`, `tooOldForFilter`, `undatedForFilter`) and never uses a daily or per-check slot. `requireImage` means the item names a picture (a feed picture or a `mediaField` address); whether it can be imported is only known later. `maxAgeHours`: an undated item fails it, one dated in the future counts as just published. `null` = no filters.",
    ),
}

export const createPostFeedRequest = z
  .object({
    aiInstructions: feedSettings.aiInstructions.optional(),
    aiIntegrationId: feedSettings.aiIntegrationId.optional(),
    aiModel: feedSettings.aiModel.optional(),
    aiWrite: feedSettings.aiWrite.optional(),
    postLatestOnFirstCheck: feedSettings.postLatestOnFirstCheck.optional(),
    dailyCap: feedSettings.dailyCap.optional(),
    destinationIds: destinationIds.describe(
      "Destination ids from `publishDestinations.list`, each once, at most 10.",
    ),
    feedUrl: feedUrl.describe(
      "The http(s) address of an RSS or Atom feed. It must be public: addresses that resolve to a private network are refused.",
    ),
    intervalMinutes: feedSettings.intervalMinutes.optional(),
    maxItemsPerRun: feedSettings.maxItemsPerRun.optional(),
    mediaField: feedSettings.mediaField.optional(),
    mediaLibraryFileIds: feedSettings.mediaLibraryFileIds.optional(),
    mediaMode: feedSettings.mediaMode.optional(),
    fetchArticleImage: feedSettings.fetchArticleImage.optional(),
    mode: feedSettings.mode.optional(),
    name: feedName.describe("A label for the feed."),
    noImageFallback: feedSettings.noImageFallback.optional(),
    postAs: feedSettings.postAs.optional(),
    filters: feedSettings.filters.optional(),
    signatureId: feedSettings.signatureId.optional(),
    templateSyntax: feedSettings.templateSyntax.optional(),
    templatesByProvider: feedSettings.templatesByProvider.optional(),
    textTemplate: feedSettings.textTemplate.optional(),
  })
  .strict()

export const updatePostFeedRequest = postFeedIdRequest
  .extend({
    aiInstructions: feedSettings.aiInstructions.optional(),
    aiIntegrationId: feedSettings.aiIntegrationId.optional(),
    aiModel: feedSettings.aiModel.optional(),
    aiWrite: feedSettings.aiWrite.optional(),
    postLatestOnFirstCheck: feedSettings.postLatestOnFirstCheck.optional(),
    dailyCap: feedSettings.dailyCap.optional(),
    destinationIds: destinationIds
      .optional()
      .describe("Replaces the feed's destinations."),
    feedUrl: feedUrl.optional().describe("New feed address."),
    intervalMinutes: feedSettings.intervalMinutes.optional(),
    maxItemsPerRun: feedSettings.maxItemsPerRun.optional(),
    mediaField: feedSettings.mediaField.optional(),
    mediaLibraryFileIds: feedSettings.mediaLibraryFileIds.optional(),
    mediaMode: feedSettings.mediaMode.optional(),
    fetchArticleImage: feedSettings.fetchArticleImage.optional(),
    mode: feedSettings.mode.optional(),
    name: feedName.optional().describe("New label."),
    noImageFallback: feedSettings.noImageFallback.optional(),
    postAs: feedSettings.postAs.optional(),
    filters: feedSettings.filters.optional(),
    signatureId: feedSettings.signatureId.optional(),
    templateSyntax: feedSettings.templateSyntax.optional(),
    templatesByProvider: feedSettings.templatesByProvider.optional(),
    textTemplate: feedSettings.textTemplate.optional(),
  })
  .strict()

export const listPostFeedItemsRequest = postFeedIdRequest.extend({
  cursor: z.string().optional().describe("`nextCursor` of the previous page."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ITEMS_PAGE_MAX)
    .default(ITEMS_PAGE_DEFAULT)
    .describe("Items per page, 1 to 100. Default 30."),
})

const postFeedItemResource = z.object({
  createdAt: z.date(),
  droppedDestinationIds: z
    .array(z.string())
    .nullable()
    .describe(
      "Destinations left out of this item's post because they cannot carry its shape (no picture for Instagram; TikTok takes video only).",
    ),
  id: z.string(),
  imageError: z
    .string()
    .nullable()
    .describe(
      "Why the picture could not be used (`notHttps`, `blocked`, `unreachable`, `timeout`, `tooLarge`, `tooManyPixels`, `notAnImage`, `unsupported`, `decodeFailed`, `budget`, `storage`, `articleUnreachable`, `articleNoImage`); the post still went out.",
    ),
  imageSource: socialPostFeedImageSources
    .nullable()
    .describe(
      "Where the item's picture came from: `enclosure`, `mediaContent`, `mediaThumbnail`, `itunesImage`, `contentImage`, `jsonFeed`, `field`, `library` or `article` (the og:image of the item's article page). The picture's alt text is the item's title. A source item edited after it was first seen is not picked up again: the first observation wins.",
    ),
  imageUrl: z.string().nullable(),
  link: z.string().nullable(),
  outcome: socialPostFeedItemOutcomes.describe(
    "`created`: a post was made (`socialPostId`); `skippedOld`: already in the feed when it was added, or too old; `skippedInvalid`: the platform refused it (see `reason`); `skippedFiltered`: the feed's filters dropped it (`reason` says which); `skippedNoImage`: no usable picture and the feed skips such items, or no destination can carry a post without one. `reason` may list notes (comma separated): `aiFallback`, `imageFailed`, `noImageFallback`, `droppedTargets`, `templateError`.",
  ),
  publishedAt: z.date().nullable(),
  reason: z.string().nullable(),
  socialPostId: z.string().nullable(),
  title: z.string().nullable(),
})

export const listPostFeedItemsResponse = z.object({
  items: z.array(postFeedItemResource),
  nextCursor: z.string().nullable(),
})

export const previewPostFeedRequest = z
  .object({
    destinationIds: z
      .array(zodBigintIdAsString())
      .max(MAX_DESTINATIONS)
      .optional()
      .describe(
        "Destinations to check the draft against (character limits, networks that cannot carry the post).",
      ),
    feedUrl: feedUrl.describe(
      "The http(s) address of an RSS, Atom or JSON feed.",
    ),
    filters: feedSettings.filters.optional(),
    mediaField: feedSettings.mediaField.optional(),
    mediaLibraryFileIds: feedSettings.mediaLibraryFileIds.optional(),
    mediaMode: feedSettings.mediaMode.optional(),
    fetchArticleImage: feedSettings.fetchArticleImage.optional(),
    noImageFallback: feedSettings.noImageFallback.optional(),
    postAs: feedSettings.postAs.optional(),
    templateSyntax: feedSettings.templateSyntax.optional(),
    templatesByProvider: feedSettings.templatesByProvider.optional(),
    textTemplate: feedSettings.textTemplate
      .optional()
      .describe(
        "A draft template to try (see `postFeeds.create` for the language). With it, every item comes back with `render`: the text, the picture that would be used, the networks that would be left out and each network's problems. Advisory only; the worker checks every post again when it creates it.",
      ),
  })
  .strict()

export const previewPostFeedResponse = z.object({
  fieldFormatVersion: z
    .number()
    .describe(
      "Version of the `fields` key format: element path with namespace prefix, `@attr` for an attribute, `name[1]` for a repeat, `name[]` for the list.",
    ),
  items: z.array(
    z.object({
      author: z.string().nullable(),
      categories: z.array(z.string()),
      fields: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .describe(
          'The item\'s raw fields as plain text, readable in a template as `raw["key"]`.',
        ),
      image: z.string().nullable(),
      images: z.array(z.object({ source: z.string(), url: z.string() })),
      itemKey: z.string(),
      link: z.string().nullable(),
      publishedAt: z.date().nullable(),
      render: z
        .object({
          articleImageWillBeTried: z
            .boolean()
            .describe(
              "True when the item names no picture but `fetchArticleImage` is on: only a real check reads the article page.",
            ),
          droppedDestinationIds: z.array(z.string()),
          filteredBy: z.string().nullable(),
          networks: z.array(
            z.object({
              characters: z.number(),
              issues: z.array(
                z.object({ code: z.string(), message: z.string() }),
              ),
              provider: z.string(),
              text: z
                .string()
                .describe(
                  "The text this network would get: its own template's when `usesOwnTemplate`, else the shared text.",
                ),
              usesOwnTemplate: z.boolean(),
            }),
          ),
          pictures: z.array(
            z.object({ source: socialPostFeedImageSources, url: z.string() }),
          ),
          providerTexts: z
            .array(
              z.object({
                provider: socialProviders,
                templateProblem: z
                  .object({
                    code: z.string(),
                    column: z.number(),
                    line: z.number(),
                    message: z.string(),
                  })
                  .nullable(),
                text: z.string(),
              }),
            )
            .describe(
              "One entry per network that has its own template in the draft (what it renders, or its problem), for per-network tabs.",
            ),
          shape: z.enum(["photo", "link", "text", "skip"]),
          templateProblem: z
            .object({
              code: z.string(),
              column: z.number(),
              line: z.number(),
              message: z.string(),
            })
            .nullable(),
          text: z.string(),
        })
        .nullable(),
      summary: z.string().nullable(),
      title: z.string().nullable(),
    }),
  ),
  variables: z.array(z.string()),
})

export const postFeedItemIdRequest = postFeedIdRequest.extend({
  itemId: zodBigintIdAsString().describe(
    "Feed item id. Get it from `postFeeds.listItems`.",
  ),
})

export const sendPostFeedTestResponse = z.object({
  note: z
    .string()
    .nullable()
    .describe(
      "`aiFallback` when AI was asked for but the text template was used instead.",
    ),
  socialPostId: z
    .string()
    .describe("The draft that was made; open it with `socialPosts.get`."),
})

export const postFeedItemDraftContentResponse = z.object({
  imageUrl: z
    .string()
    .nullable()
    .describe(
      "The item's picture (http(s)). Add it to a post as a file with `url`: it is imported with the same address checks as any media URL.",
    ),
  linkUrl: z.string().nullable(),
  text: z.string().describe("The feed's text template applied to the item."),
  title: z.string().nullable(),
})
