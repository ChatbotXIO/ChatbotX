import type {
  SocialPostFeedErrorCode,
  SocialPostFeedFilters,
  SocialPostFeedImageSource,
  SocialPostFeedItemOutcome,
  SocialPostFeedMediaMode,
  SocialPostFeedMode,
  SocialPostFeedNoImageFallback,
  SocialPostFeedPostAs,
  SocialPostFeedRunSummary,
  SocialPostFeedStatus,
  SocialPostFeedTemplateSyntax,
  SocialPostFeedTemplatesByProvider,
  SocialPostFeedWaitingReason,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import type { FeedPostShape } from "./feed-shape"
import type { FeedFields } from "./fields"

/** A feed as the API shows it. */
export type PostFeedDto = {
  aiInstructions: string | null
  aiIntegrationId: string | null
  aiModel: string | null
  aiWrite: boolean
  consecutiveFailures: number
  createdAt: Date
  dailyCap: number
  destinationIds: string[]
  feedUrl: string
  fetchArticleImage: boolean
  filters: SocialPostFeedFilters | null
  id: string
  intervalMinutes: number
  lastCheckedAt: Date | null
  lastErrorCode: SocialPostFeedErrorCode | null
  /** What the last check did; null until the first check. */
  lastRunSummary: SocialPostFeedRunSummary | null
  maxItemsPerRun: number
  mediaField: string | null
  mediaLibraryFileIds: string[]
  mediaMode: SocialPostFeedMediaMode
  mode: SocialPostFeedMode
  name: string
  nextCheckAt: Date
  noImageFallback: SocialPostFeedNoImageFallback
  postAs: SocialPostFeedPostAs
  postLatestOnFirstCheck: boolean
  /** False until the first check has recorded the items the feed already had. */
  primed: boolean
  signatureId: string | null
  startedAt: Date
  status: SocialPostFeedStatus
  /** The language of `textTemplate`: `legacy` is `{title}`, `v2` is `{{ title }}`. */
  templateSyntax: SocialPostFeedTemplateSyntax
  /** Text per network instead of `textTemplate` (`v2` only); `{}` = every network uses `textTemplate`. */
  templatesByProvider: SocialPostFeedTemplatesByProvider
  textTemplate: string
}

export type PostFeedItemDto = {
  createdAt: Date
  /** Destinations left out of this item's post (they cannot carry its shape). */
  droppedDestinationIds: string[] | null
  id: string
  imageError: string | null
  imageSource: SocialPostFeedImageSource | null
  imageUrl: string | null
  link: string | null
  outcome: SocialPostFeedItemOutcome
  publishedAt: Date | null
  reason: string | null
  socialPostId: string | null
  title: string | null
}

export type PostFeedItemsPage = {
  items: PostFeedItemDto[]
  nextCursor: string | null
}

export type PostFeedPreviewItem = {
  link: string | null
  publishedAt: Date | null
  summary: string | null
  title: string | null
}

/** A problem with the draft text for one network (`code` is a publishing-rule issue code). */
export type PostFeedPreviewNetwork = {
  characters: number
  issues: { code: string; message: string }[]
  provider: string
  /** The text this network would get (its own template's, else the shared one). */
  text: string
  /** True when `text` comes from the network's own template. */
  usesOwnTemplate: boolean
}

/** What one network's own template renders for an item (only networks that have one). */
export type PostFeedPreviewProviderText = {
  provider: SocialProvider
  templateProblem: PostFeedTemplateProblem | null
  text: string
}

/** A template that does not parse or render, with where. */
export type PostFeedTemplateProblem = {
  code: string
  column: number
  line: number
  message: string
}

/** What a draft configuration does with one item (advisory: the worker decides at creation time). */
export type PostFeedPreviewRender = {
  /** True when the item names no picture but the feed reads its article page for one (only a real check does that). */
  articleImageWillBeTried: boolean
  /** Destinations that cannot carry the item's post shape. */
  droppedDestinationIds: string[]
  /** Why the filters would drop the item, else null. */
  filteredBy: string | null
  networks: PostFeedPreviewNetwork[]
  /** The pictures the item could use, best first (nothing is downloaded by a preview). */
  pictures: { source: SocialPostFeedImageSource; url: string }[]
  /** One entry per network that has its own template in the draft, for the form's tabs. */
  providerTexts: PostFeedPreviewProviderText[]
  shape: FeedPostShape
  templateProblem: PostFeedTemplateProblem | null
  /** The rendered text (without signature); empty when the template has a problem. */
  text: string
}

export type PostFeedPreviewDetectedItem = PostFeedPreviewItem & {
  author: string | null
  categories: string[]
  /** Raw fields, plain text, in the versioned key format. */
  fields: FeedFields
  image: string | null
  images: { source: string; url: string }[]
  itemKey: string
  render: PostFeedPreviewRender | null
}

export type PostFeedPreview = {
  /** Variables every v2 template can read. */
  fieldFormatVersion: number
  items: PostFeedPreviewDetectedItem[]
  variables: string[]
}

/** The draft configuration a preview applies; every part optional. */
export type PostFeedPreviewConfig = {
  destinationIds?: string[]
  fetchArticleImage?: boolean
  filters?: SocialPostFeedFilters | null
  mediaField?: string | null
  mediaLibraryFileIds?: string[]
  mediaMode?: SocialPostFeedMediaMode
  noImageFallback?: SocialPostFeedNoImageFallback
  postAs?: SocialPostFeedPostAs
  templateSyntax?: SocialPostFeedTemplateSyntax
  templatesByProvider?: SocialPostFeedTemplatesByProvider
  textTemplate?: string
  workspaceId?: string
}

/** What "Send test" made: a draft built from the newest item, as the feed would build it. */
export type PostFeedTestResult = {
  /** Set when AI was asked for and the template was used instead. */
  note: string | null
  socialPostId: string
}

/** What the composer is prefilled with for one feed item. */
export type PostFeedItemDraftContent = {
  imageUrl: string | null
  linkUrl: string | null
  text: string
  title: string | null
}

export type CreatePostFeedInput = {
  aiInstructions?: string | null
  aiIntegrationId?: string | null
  aiModel?: string | null
  aiWrite?: boolean
  createdById: string | null
  dailyCap?: number
  destinationIds: string[]
  feedUrl: string
  fetchArticleImage?: boolean
  filters?: SocialPostFeedFilters | null
  intervalMinutes?: number
  maxItemsPerRun?: number
  mediaField?: string | null
  mediaLibraryFileIds?: string[]
  mediaMode?: SocialPostFeedMediaMode
  mode?: SocialPostFeedMode
  name: string
  noImageFallback?: SocialPostFeedNoImageFallback
  postAs?: SocialPostFeedPostAs
  postLatestOnFirstCheck?: boolean
  signatureId?: string | null
  templateSyntax?: SocialPostFeedTemplateSyntax
  templatesByProvider?: SocialPostFeedTemplatesByProvider
  textTemplate?: string
  workspaceId: string
}

export type UpdatePostFeedInput = {
  aiInstructions?: string | null
  aiIntegrationId?: string | null
  aiModel?: string | null
  aiWrite?: boolean
  dailyCap?: number
  destinationIds?: string[]
  feedUrl?: string
  fetchArticleImage?: boolean
  filters?: SocialPostFeedFilters | null
  id: string
  intervalMinutes?: number
  maxItemsPerRun?: number
  mediaField?: string | null
  mediaLibraryFileIds?: string[]
  mediaMode?: SocialPostFeedMediaMode
  mode?: SocialPostFeedMode
  name?: string
  noImageFallback?: SocialPostFeedNoImageFallback
  postAs?: SocialPostFeedPostAs
  postLatestOnFirstCheck?: boolean
  signatureId?: string | null
  templateSyntax?: SocialPostFeedTemplateSyntax
  templatesByProvider?: SocialPostFeedTemplatesByProvider
  textTemplate?: string
  workspaceId: string
}

/** What one check did; for logs and tests. */
export type RunFeedResult =
  | { kind: "skipped" }
  | { kind: "notModified" }
  /** The source returned an older copy than the ledger has seen: nothing was written, the check is repeated soon. */
  | { kind: "stale"; retries: number }
  | { kind: "failed"; code: string }
  | {
      created: number
      /** New items that passed the age and filter rules (candidates). */
      eligible: number
      /** New items (not in the ledger yet). */
      fresh: number
      invalid: number
      /** Items in the fetched copy. */
      items: number
      kind: "checked"
      primed: boolean
      skipped: number
      /** Eligible items not tried this check (limits, budget): the next check takes them. */
      waiting: number
      /** Why the waiting items were left; set only when `waiting` is above 0. */
      waitingReason?: SocialPostFeedWaitingReason
      /** With `dailyCap` as the reason: the cap in force and when a place frees up. */
      dailyCap?: number
      nextSlotAt?: string
    }
