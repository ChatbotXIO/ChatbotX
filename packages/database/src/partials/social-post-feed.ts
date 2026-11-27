import { socialProviders } from "@chatbotx.io/utils/social-account"
import { z } from "zod"

/** `error` is set by the worker after repeated failed checks; resuming sets it back to `active`. */
export const socialPostFeedStatuses = z.enum(["active", "paused", "error"])
export type SocialPostFeedStatus = z.infer<typeof socialPostFeedStatuses>

/** What a feed does with a new item: keep it as a draft, or queue it on each destination's posting schedule. */
export const socialPostFeedModes = z.enum(["draft", "queue"])
export type SocialPostFeedMode = z.infer<typeof socialPostFeedModes>

/** What happened to one feed item, recorded once in the ledger. */
export const socialPostFeedItemOutcomes = z.enum([
  "created",
  "skippedOld",
  "skippedInvalid",
  // The item did not pass the feed's filters (keywords, categories, picture, age).
  "skippedFiltered",
  // The feed's `noImageFallback` is `skip` and the item had no usable picture, or every
  // destination needs one.
  "skippedNoImage",
])
export type SocialPostFeedItemOutcome = z.infer<
  typeof socialPostFeedItemOutcomes
>

/** Why a feed check failed; stored on the feed and shown to its owner. */
export const socialPostFeedErrorCodes = z.enum([
  "blocked",
  "timeout",
  "tooLarge",
  "badStatus",
  "badContentType",
  "unreachable",
  "tooManyRedirects",
  "invalidFeed",
  // A post could not be made for a reason that is not the item's content (no posting
  // slot, a blocked workspace, a destination problem): nothing was recorded for the
  // item and the next check tries it again.
  "postRefused",
  "internal",
])
export type SocialPostFeedErrorCode = z.infer<typeof socialPostFeedErrorCodes>

/** Which template language a feed's `textTemplate` is written in. `legacy` is `{title}` (kept accepted by the API); `v2` is `{{ title }}` and the default. */
export const socialPostFeedTemplateSyntaxes = z.enum(["legacy", "v2"])
export type SocialPostFeedTemplateSyntax = z.infer<
  typeof socialPostFeedTemplateSyntaxes
>

/** Where a feed's post pictures come from: the feed itself, a feed field or URL template, or none. */
export const socialPostFeedMediaModes = z.enum(["auto", "field", "none"])
export type SocialPostFeedMediaMode = z.infer<typeof socialPostFeedMediaModes>

/** The shape of a post made from an item: with its picture, with a link preview, or text only. */
export const socialPostFeedPostAs = z.enum(["photo", "link", "text"])
export type SocialPostFeedPostAs = z.infer<typeof socialPostFeedPostAs>

/** What a post becomes when an item has no usable picture. */
export const socialPostFeedNoImageFallbacks = z.enum(["link", "text", "skip"])
export type SocialPostFeedNoImageFallback = z.infer<
  typeof socialPostFeedNoImageFallbacks
>

/** Where the picture of a ledger row came from (provenance shown in the Items list). */
export const socialPostFeedImageSources = z.enum([
  "enclosure",
  "mediaContent",
  "mediaThumbnail",
  "itunesImage",
  "contentImage",
  "jsonFeed",
  "field",
  "library",
  // The og:image / twitter:image of the item's article page (feed setting `fetchArticleImage`).
  "article",
])
export type SocialPostFeedImageSource = z.infer<
  typeof socialPostFeedImageSources
>

/** Why a picture could not be used; the post still went out without it. */
export const socialPostFeedImageErrors = z.enum([
  "notHttps",
  "blocked",
  "unreachable",
  "timeout",
  "tooLarge",
  "tooManyPixels",
  "notAnImage",
  "unsupported",
  "decodeFailed",
  "budget",
  "storage",
  // `fetchArticleImage`: the article page could not be read, or names no picture.
  "articleUnreachable",
  "articleNoImage",
])
export type SocialPostFeedImageError = z.infer<typeof socialPostFeedImageErrors>

export const MAX_FEED_PROVIDER_TEMPLATE_LENGTH = 5000

/**
 * Text written for one network instead of the shared `textTemplate` (same
 * template language, same limits). A strict record keyed by the provider enum:
 * an unknown network is a validation error, a missing one uses the shared text.
 */
export const socialPostFeedTemplatesByProvider = z.partialRecord(
  socialProviders,
  z.string().min(1).max(MAX_FEED_PROVIDER_TEMPLATE_LENGTH),
)
export type SocialPostFeedTemplatesByProvider = z.infer<
  typeof socialPostFeedTemplatesByProvider
>

export const MAX_FEED_FILTER_TERMS = 20
export const MAX_FEED_FILTER_TERM_LENGTH = 100
export const MAX_FEED_FILTER_AGE_HOURS = 24 * 7
export const MAX_FEED_FALLBACK_IMAGES = 10

/** Request limits of the feeds API. Shared by the builder schema and the business validation, so the two cannot drift. */
export const MIN_POST_FEED_INTERVAL_MINUTES = 15
export const MAX_POST_FEED_INTERVAL_MINUTES = 1440
export const MAX_POST_FEED_DAILY_CAP = 10
export const MAX_POST_FEED_ITEMS_PER_RUN = 5
export const MAX_DESTINATIONS_PER_POST_FEED = 10
export const MAX_POST_FEED_URL_LENGTH = 2048
export const MAX_POST_FEED_NAME_LENGTH = 100
export const MAX_POST_FEED_TEMPLATE_LENGTH = 5000
export const POST_FEED_ITEMS_PAGE_SIZE_DEFAULT = 30
export const POST_FEED_ITEMS_PAGE_SIZE_MAX = 100
export const MAX_BULK_DELETE_POST_FEEDS = 100
export const MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH = 300

/**
 * Which items of a feed become posts. An item must contain at least one
 * `includeAny` term (when given), none of the `excludeAny` terms, and carry one
 * of the `categoriesAny` (when given); terms match title, summary and categories
 * ignoring case and diacritics. `requireImage` keeps only items with a usable
 * picture; `maxAgeHours` skips items older than that (an undated item never
 * passes it; one dated in the future counts as just published).
 */
export const socialPostFeedFilters = z
  .object({
    categoriesAny: z
      .array(z.string().trim().min(1).max(MAX_FEED_FILTER_TERM_LENGTH))
      .max(MAX_FEED_FILTER_TERMS)
      .optional(),
    excludeAny: z
      .array(z.string().trim().min(1).max(MAX_FEED_FILTER_TERM_LENGTH))
      .max(MAX_FEED_FILTER_TERMS)
      .optional(),
    includeAny: z
      .array(z.string().trim().min(1).max(MAX_FEED_FILTER_TERM_LENGTH))
      .max(MAX_FEED_FILTER_TERMS)
      .optional(),
    maxAgeHours: z
      .number()
      .int()
      .min(1)
      .max(MAX_FEED_FILTER_AGE_HOURS)
      .optional(),
    requireImage: z.boolean().optional(),
  })
  .strict()
export type SocialPostFeedFilters = z.infer<typeof socialPostFeedFilters>

/** What the last check of a feed did, kept for the Feeds page (no migration of history: only the last run). */
export const socialPostFeedRunKinds = z.enum([
  "checked",
  "notModified",
  "stale",
  "failed",
])
export type SocialPostFeedRunKind = z.infer<typeof socialPostFeedRunKinds>

/** Why new items were left for a later check. Absent when nothing was left waiting. */
export const socialPostFeedWaitingReasons = z.enum([
  "dailyCap",
  "runLimit",
  "attempts",
  "timeBudget",
  "pictureBudget",
])
export type SocialPostFeedWaitingReason = z.infer<
  typeof socialPostFeedWaitingReasons
>

export const socialPostFeedRunSummary = z
  .object({
    /** Posts made by that check. */
    created: z.number().int().min(0),
    /** New items (not in the ledger yet) that passed the age and filter rules but were not tried: left for the next check. */
    waiting: z.number().int().min(0),
    /** Why those items wait; set only when `waiting` is above 0. */
    waitingReason: socialPostFeedWaitingReasons.optional(),
    /** The rolling 24 h cap in force (feed and destinations); set with `dailyCap` as the reason. */
    dailyCap: z.number().int().min(0).optional(),
    /** When the cap frees a place (oldest counted post plus 24 h, ISO 8601); set with `dailyCap` as the reason. */
    nextSlotAt: z.string().optional(),
    /** Items the feed returned in that check. */
    items: z.number().int().min(0),
    /** Items the ledger did not know yet. */
    fresh: z.number().int().min(0),
    kind: socialPostFeedRunKinds,
    /** Items recorded as skipped because the platform refused their content. */
    refused: z.number().int().min(0),
    /** Early re-checks in a row after the source returned an older copy (at most 3). */
    staleRetries: z.number().int().min(0),
  })
  .strict()
export type SocialPostFeedRunSummary = z.infer<typeof socialPostFeedRunSummary>
