import type {
  SocialPostFeedFilters,
  SocialPostFeedMediaMode,
  SocialPostFeedMode,
  SocialPostFeedNoImageFallback,
  SocialPostFeedPostAs,
  SocialPostFeedTemplateSyntax,
  SocialPostFeedTemplatesByProvider,
} from "@chatbotx.io/database/partials"
import type { z } from "zod"
import type { postFeedResource } from "../schema"
import {
  FEED_DEFAULT_DAILY_CAP,
  FEED_DEFAULT_INTERVAL_MINUTES,
  FEED_DEFAULT_TEMPLATE,
} from "./feed-options"

export type Feed = z.infer<typeof postFeedResource>

/** The form's state: one field per setting, text where an input needs text. */
export type FeedDraft = {
  aiInstructions: string
  aiIntegrationId: string | null
  aiModel: string | null
  aiWrite: boolean
  categoriesAny: string[]
  dailyCap: number
  destinationIds: string[]
  excludeAny: string[]
  feedUrl: string
  fetchArticleImage: boolean
  includeAny: string[]
  intervalMinutes: number
  maxAgeHours: string
  mediaField: string
  mediaLibraryFileIds: string[]
  mediaMode: SocialPostFeedMediaMode
  mode: SocialPostFeedMode
  name: string
  noImageFallback: SocialPostFeedNoImageFallback
  postAs: SocialPostFeedPostAs
  postLatestOnFirstCheck: boolean
  requireImage: boolean
  templateSyntax: SocialPostFeedTemplateSyntax
  /** Text per network; a missing or blank entry means the network uses `textTemplate`. */
  templatesByProvider: SocialPostFeedTemplatesByProvider
  textTemplate: string
}

export const EMPTY_FEED_DRAFT: FeedDraft = {
  aiInstructions: "",
  aiIntegrationId: null,
  aiModel: null,
  aiWrite: false,
  categoriesAny: [],
  dailyCap: FEED_DEFAULT_DAILY_CAP,
  destinationIds: [],
  excludeAny: [],
  feedUrl: "",
  fetchArticleImage: false,
  includeAny: [],
  intervalMinutes: FEED_DEFAULT_INTERVAL_MINUTES,
  maxAgeHours: "",
  mediaField: "",
  mediaLibraryFileIds: [],
  mediaMode: "auto",
  mode: "draft",
  name: "",
  noImageFallback: "link",
  postAs: "photo",
  postLatestOnFirstCheck: false,
  requireImage: false,
  templateSyntax: "v2",
  templatesByProvider: {},
  textTemplate: FEED_DEFAULT_TEMPLATE,
}

export const draftOfFeed = (feed: Feed | null): FeedDraft =>
  feed
    ? {
        aiInstructions: feed.aiInstructions ?? "",
        aiIntegrationId: feed.aiIntegrationId,
        aiModel: feed.aiModel,
        aiWrite: feed.aiWrite,
        categoriesAny: feed.filters?.categoriesAny ?? [],
        dailyCap: feed.dailyCap,
        destinationIds: feed.destinationIds,
        excludeAny: feed.filters?.excludeAny ?? [],
        feedUrl: feed.feedUrl,
        fetchArticleImage: feed.fetchArticleImage,
        includeAny: feed.filters?.includeAny ?? [],
        intervalMinutes: feed.intervalMinutes,
        maxAgeHours: feed.filters?.maxAgeHours?.toString() ?? "",
        mediaField: feed.mediaField ?? "",
        mediaLibraryFileIds: feed.mediaLibraryFileIds,
        mediaMode: feed.mediaMode,
        mode: feed.mode,
        name: feed.name,
        noImageFallback: feed.noImageFallback,
        postAs: feed.postAs,
        postLatestOnFirstCheck: feed.postLatestOnFirstCheck,
        requireImage: feed.filters?.requireImage ?? false,
        templateSyntax: feed.templateSyntax,
        templatesByProvider: feed.templatesByProvider,
        textTemplate: feed.textTemplate,
      }
    : EMPTY_FEED_DRAFT

/** The filters of a draft, or null when none is set. */
export const filtersOfDraft = (
  draft: FeedDraft,
): SocialPostFeedFilters | null => {
  const maxAge = Number.parseInt(draft.maxAgeHours, 10)
  const filters: SocialPostFeedFilters = {
    ...(draft.includeAny.length > 0 ? { includeAny: draft.includeAny } : {}),
    ...(draft.excludeAny.length > 0 ? { excludeAny: draft.excludeAny } : {}),
    ...(draft.categoriesAny.length > 0
      ? { categoriesAny: draft.categoriesAny }
      : {}),
    ...(draft.requireImage ? { requireImage: true } : {}),
    ...(Number.isInteger(maxAge) && maxAge > 0 ? { maxAgeHours: maxAge } : {}),
  }
  return Object.keys(filters).length > 0 ? filters : null
}

/** The network texts of a draft without the blank ones; a legacy feed has none. */
export const templatesOfDraft = (
  draft: FeedDraft,
): SocialPostFeedTemplatesByProvider =>
  draft.templateSyntax === "v2"
    ? Object.fromEntries(
        Object.entries(draft.templatesByProvider).filter(
          ([, template]) => template.trim().length > 0,
        ),
      )
    : {}

/** The settings both the save and the preview send. */
export const contentSettingsOf = (draft: FeedDraft) => ({
  fetchArticleImage: draft.fetchArticleImage,
  filters: filtersOfDraft(draft),
  mediaField:
    draft.mediaMode === "field" ? draft.mediaField.trim() || null : null,
  mediaLibraryFileIds: draft.mediaLibraryFileIds,
  mediaMode: draft.mediaMode,
  noImageFallback: draft.noImageFallback,
  postAs: draft.postAs,
  templateSyntax: draft.templateSyntax,
  templatesByProvider: templatesOfDraft(draft),
  textTemplate: draft.textTemplate,
})
