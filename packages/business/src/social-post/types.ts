import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  SocialContentType,
  SocialMediaKind,
  SocialPostCreatedVia,
  SocialPostPartKind,
  SocialPostPartStatus,
  SocialPostRecurrenceOutcome,
  SocialPostScheduleMode,
  SocialPostStatus,
  SocialPostTargetStatus,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import type {
  PartIssueField,
  PostIssueCode,
  PostIssueField,
} from "@chatbotx.io/utils/post-publishing"
import type { PostingScheduleSlots } from "@chatbotx.io/utils/posting-slots"
import type {
  RecurrenceRule,
  UpcomingSlot,
} from "@chatbotx.io/utils/recurrence"
import type { SocialQueuePosition } from "@chatbotx.io/utils/social-post"

/** The options of one target (see the registry's option fields). */
export type SocialPostOptions = Record<string, boolean | string | number>

/**
 * One media file of a post: a file already in the Media Library, or a public
 * URL to import. Exactly one of the two is given.
 */
export type SocialMediaInput = {
  altText?: string | null
  mediaLibraryFileId?: string
  url?: string
}

/**
 * When a post goes out. At most one of `scheduledAt` and `queue` applies to the
 * targets without a time of their own; neither means a draft. A target's own
 * time (`targetTimes`, by destination id) wins over the post's.
 */
export type SchedulePlan = {
  /**
   * With `queue`: a destination that has no posting schedule gets the earliest
   * time that respects the publishing pace (spacing and daily cap) instead of
   * a refusal. Feeds set it; a person or agent asking for the queue still gets
   * the refusal, so they know to set posting times.
   */
  autoSpacing?: boolean
  queue?: SocialQueuePosition
  scheduledAt?: Date
  targetTimes?: Readonly<Record<string, Date>>
  /** IANA zone the times are shown in; the workspace's when omitted. */
  timezone?: string
}

/** What a reschedule does to the targets it reaches. */
export type RescheduleChange =
  | { kind: "at"; scheduledAt: Date; timezone?: string }
  | { kind: "queue"; position: SocialQueuePosition }
  | { kind: "timezone"; timezone: string }
  | { kind: "unschedule" }

/** One follow-up of a target: a thread part or the first comment. Text only. */
export type SocialPostPartInput = { text: string }

export type SocialPostTargetInput = {
  /** Derived from the content when omitted. */
  contentType?: SocialContentType
  destinationId: string
  /** The first comment, published after the head and every thread part. */
  firstComment?: SocialPostPartInput | null
  /** `undefined`/`null` use the post's shared media; an array (even empty) overrides it. */
  media?: SocialMediaInput[] | null
  options?: SocialPostOptions
  /** Thread parts, in order, published as replies after the head. */
  parts?: SocialPostPartInput[]
  /** Replaces the post's text for this destination. */
  text?: string | null
}

export type SocialPostContentInput = {
  linkUrl?: string | null
  media?: SocialMediaInput[]
  targets: SocialPostTargetInput[]
  text?: string | null
  topicIds?: string[]
}

/**
 * A step that runs inside the transaction that stores a post, after its rows
 * are written (scheduling uses it, so the post and its schedule commit
 * together or not at all).
 */
export type PostWriteHook = (
  tx: DatabaseClient,
  postId: string,
) => Promise<void>

export type CreateSocialPostInput = SocialPostContentInput & {
  afterWrite?: PostWriteHook
  createdById: string | null
  createdVia: SocialPostCreatedVia
  idempotencyKey?: string | null
  workspaceId: string
}

export type UpdateSocialPostInput = {
  afterWrite?: PostWriteHook
  id: string
  linkUrl?: string | null
  media?: SocialMediaInput[]
  targets?: SocialPostTargetInput[]
  text?: string | null
  topicIds?: string[]
  workspaceId: string
}

export type SocialPostMediaDto = {
  altText: string | null
  durationMs: number | null
  height: number | null
  id: string
  kind: SocialMediaKind
  mediaLibraryFileId: string | null
  mimeType: string
  position: number
  size: number
  url: string
  width: number | null
}

/** A follow-up part with its own publish state. */
export type SocialPostPartDto = {
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  externalPostId: string | null
  id: string
  kind: SocialPostPartKind
  permalink: string | null
  position: number
  publishedAt: Date | null
  status: SocialPostPartStatus
  text: string
}

export type SocialPostTargetDto = {
  contentType: SocialContentType
  destination: {
    /** The inbox that publishes (Facebook, Instagram, Threads); `null` for TikTok. */
    inboxId: string | null
    avatar: string | null
    id: string
    isActive: boolean
    name: string
    /** The TikTok publishing login; `null` for the inbox networks. */
    socialAccountId: string | null
    username: string | null
  }
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  externalPostId: string | null
  id: string
  /** The files this destination publishes: its own when it overrides, else the post's. */
  media: SocialPostMediaDto[]
  options: SocialPostOptions
  overridesMedia: boolean
  /** Thread parts and the first comment (last), in publish order. */
  parts: SocialPostPartDto[]
  permalink: string | null
  provider: SocialProvider
  publishedAt: Date | null
  /** The destination's queue slot while the target waits in the queue. */
  queueSlotAt: Date | null
  /** When the post was taken down from the network; the target stays `published`. */
  removedAt: Date | null
  scheduleMode: SocialPostScheduleMode
  scheduledAt: Date | null
  status: SocialPostTargetStatus
  textOverride: string | null
  timezone: string | null
}

export type SocialPostTopicDto = {
  color: string | null
  id: string
  name: string
}

export type SocialPostRecurrenceState = "active" | "ended" | "paused"

/** The repeat schedule of a template post. */
export type SocialPostRecurrenceDto = {
  accountedThroughAt: Date | null
  endedAt: Date | null
  /** The next slot to be turned into a post; null once the series is over. */
  nextRunAt: Date | null
  occurrenceCount: number
  pausedAt: Date | null
  rule: RecurrenceRule
  state: SocialPostRecurrenceState
  /** The next slots, skipped dates included and flagged. */
  upcoming: UpcomingSlot[]
}

/** One slot of a series as the ledger recorded it. */
export type SocialPostOccurrenceDto = {
  id: string
  localSlot: string
  occurrenceAt: Date
  outcome: SocialPostRecurrenceOutcome
  /** Current status of the occurrence post; null when none was made or it was deleted. */
  postStatus: SocialPostStatus | null
  socialPostId: string | null
}

export type SocialPostOccurrencePage = {
  items: SocialPostOccurrenceDto[]
  nextCursor?: { id: string; occurrenceAt: string }
}

export type SocialPostDto = {
  completedAt: Date | null
  createdAt: Date
  createdById: string | null
  createdVia: SocialPostCreatedVia
  id: string
  linkUrl: string | null
  /** The post's shared files. */
  media: SocialPostMediaDto[]
  /** For an occurrence of a recurring post: the slot it was made for. */
  occurrenceAt: Date | null
  /** For an occurrence of a recurring post: its template. */
  parentSocialPostId: string | null
  /** The repeat schedule, when this post is a recurring template. */
  recurrence: SocialPostRecurrenceDto | null
  /** The earliest time among the targets (when published, or scheduled): the calendar's time. */
  scheduledAt: Date | null
  status: SocialPostStatus
  targets: SocialPostTargetDto[]
  text: string | null
  topics: SocialPostTopicDto[]
  updatedAt: Date
}

/** Where a post list page stopped; pass it back unchanged for the next page. */
export type SocialPostCursor = { createdAt: string; id: string }

export type SocialPostPage = {
  items: SocialPostDto[]
  nextCursor?: SocialPostCursor
}

export type SocialPostIssue = {
  code: PostIssueCode
  destinationId: string
  field: PartIssueField | PostIssueField
  message: string
  /** Set for an issue of a follow-up part: its index among the target's parts, the first comment last. */
  partIndex?: number
  targetIndex: number
}

export type SocialPostValidation = {
  issues: SocialPostIssue[]
  valid: boolean
}

export type SocialPostPreviewTarget = {
  charactersUsed: number
  contentType: SocialContentType
  destinationId: string
  issues: SocialPostIssue[]
  linkUrl: string | null
  maxCharacters: number | null
  mediaCount: number
  options: SocialPostOptions
  provider: SocialProvider
  targetIndex: number
  text: string | null
}

export type PostingScheduleDto = {
  /** `false` until someone sets the schedule: the slots are then all off. */
  configured: boolean
  destinationId: string
  slots: PostingScheduleSlots
  timezone: string
  updatedAt: Date | null
}

/** What editing a posting schedule did to the posts waiting in its queue. */
export type PostingScheduleReflow = {
  /** Targets left without a valid slot: they keep their time but are no longer queued. */
  detached: { scheduledAt: Date | null; targetId: string }[]
  /** Targets that kept their slot. */
  keptCount: number
  /** Targets given another slot. */
  moved: { from: Date; targetId: string; to: Date }[]
}

export type PostingScheduleUpdateResult = {
  reflow: PostingScheduleReflow
  schedule: PostingScheduleDto
}

export type FreeSlotsDto = {
  items: Date[]
  timezone: string
}
