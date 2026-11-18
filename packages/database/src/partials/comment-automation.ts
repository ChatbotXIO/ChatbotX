import { z } from "zod"

export const commentAutomationTypes = z.enum([
  "messenger",
  "instagram",
  "instagramFacebook",
  "threads",
  "tiktok",
])
export type CommentAutomationType = z.infer<typeof commentAutomationTypes>

export const igCommentAutomationTypes = z.enum([
  "instagram",
  "instagramFacebook",
])
export type IgCommentAutomationType = z.infer<typeof igCommentAutomationTypes>

/**
 * The channels that can answer a comment with a comment-anchored DM.
 *
 * Kept here rather than next to the dispatch, because it is not only the worker
 * that needs the answer: the analytics counters are scoped to the DM (see
 * `countsTowardStats`), so a channel without one has to count its public
 * comment replies instead or every column on its list row reads zero forever.
 * `packages/analytics` cannot import the worker's
 * `PRIVATE_REPLY_TEXT_SENDERS` — that map pulls in every Meta integration — so
 * the capability lives with the channel enum it keys off, and
 * `comment-automation.test.ts` asserts the two never drift.
 *
 * An allowlist, like `CHANNELS_WITH_COMMENT_LIKE`: a channel added without a
 * decision here should default to "cannot", not inherit a DM by omission.
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_PRIVATE_REPLY =
  new Set<CommentAutomationType>([
    "messenger",
    "instagram",
    "instagramFacebook",
    // TikTok Comment-to-Message: `direct_reply` addresses the DM by comment id,
    // so no conversation has to exist first. It only fires for comments TikTok
    // itself flags as high intent, which makes the DM rarer here than on Meta —
    // but it is still the half these counters measure, because it is the half
    // that carries a delivery receipt.
    "tiktok",
  ])

/**
 * Whether the channel can answer a comment with a private DM. Threads is the
 * only one that cannot: its API has no DM endpoint of any kind.
 */
export function commentAutomationChannelSupportsPrivateReply(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_PRIVATE_REPLY.has(type)
}

/**
 * The channels that expose enough about a comment to tell it carries a GIF:
 * Facebook's comment `attachment.type` (`animated_image_*`) and Threads'
 * reply `gif_url`. Instagram and TikTok deliver comment text only, so the
 * builder hides the switch there and the service pins `hasGif` off on write —
 * otherwise a public-API or MCP client could store a switch that never
 * matches.
 *
 * An allowlist, like the private-reply one above: a new channel defaults to
 * "cannot".
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_GIF_DETECTION =
  new Set<CommentAutomationType>(["messenger", "threads"])

export function commentAutomationChannelSupportsHideGif(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_GIF_DETECTION.has(type)
}

/**
 * The channels that can tell a comment carries a photo, for
 * `options.onlyCommentsWithImage`: Facebook from the comment's
 * `attachment.type` (`photo`), Threads from the reply's `media_type`
 * (`IMAGE`/`CAROUSEL_ALBUM`). Instagram and TikTok deliver comment text only,
 * so the builder hides the switch there and the service pins it off on write.
 *
 * An allowlist: a new channel defaults to "cannot".
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_IMAGE_DETECTION =
  new Set<CommentAutomationType>(["messenger", "threads"])

export function commentAutomationChannelSupportsImageFilter(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_IMAGE_DETECTION.has(type)
}

export const commentPostTypes = z.enum([
  "published",
  "ads",
  "reels",
  "postIds",
  "all",
  "live",
  "hashtags",
])
export type CommentPostType = z.infer<typeof commentPostTypes>

export const commentPostSchema = z.object({
  type: commentPostTypes.describe(
    "Which posts the automation watches: `postIds` (only the posts listed in `value`), `hashtags` (any non-live post whose caption carries at least one hashtag listed in `value`), `live` (live videos), or `all`/`published`/`ads`/`reels` (any post; `value` unused, send `[]`).",
  ),
  value: z
    .array(z.string())
    .describe(
      "For `postIds`: post or media ids to watch (get them from the channel's list-posts/list-media route). For `hashtags`: 1-20 hashtags without the leading `#` (e.g. `vip`); letters, digits and `_` only, matched whole-tag and ignoring case. Send `[]` otherwise.",
    ),
})
export type CommentPost = z.infer<typeof commentPostSchema>

/** Upper bound on a `hashtags` post target's list, mirrored by the forms. */
export const COMMENT_POST_HASHTAGS_MAX = 20
export const COMMENT_POST_HASHTAG_MAX_LENGTH = 100

/**
 * What a hashtag is made of on every supported channel: letters (any script,
 * including Vietnamese with its combining marks), digits and `_`. Anything
 * else — a space, `-`, `.`, `!` — ends the tag, which is how Facebook,
 * Instagram, Threads and TikTok all cut `#vip!` down to `#vip`.
 */
const HASHTAG_CHARACTERS = "[\\p{L}\\p{M}\\p{N}_]"
const HASHTAG_BODY_PATTERN = new RegExp(`^${HASHTAG_CHARACTERS}+$`, "u")
const CAPTION_HASHTAG_PATTERN = new RegExp(`#(${HASHTAG_CHARACTERS}+)`, "gu")
const LEADING_HASH_PATTERN = /^#+/

/**
 * The canonical form a hashtag is stored and compared in: no leading `#`,
 * Unicode NFC (a decomposed `ế` equals the composed one) and lower case, so
 * `#VIP`, `vip` and `#Vip` are one tag.
 */
export function normalizeCommentPostHashtag(raw: string): string {
  return raw
    .trim()
    .replace(LEADING_HASH_PATTERN, "")
    .normalize("NFC")
    .toLowerCase()
}

/** Whether an already-normalized hashtag is one a caption could carry. */
export function isValidCommentPostHashtag(tag: string): boolean {
  return (
    tag.length > 0 &&
    tag.length <= COMMENT_POST_HASHTAG_MAX_LENGTH &&
    HASHTAG_BODY_PATTERN.test(tag)
  )
}

/** Normalizes a hashtag list and drops blanks and duplicates, keeping order. */
export function normalizeCommentPostHashtags(values: string[]): string[] {
  return [
    ...new Set(
      values.map(normalizeCommentPostHashtag).filter((tag) => tag.length > 0),
    ),
  ]
}

/** The hashtags a post caption carries, in canonical form. */
export function extractCaptionHashtags(caption: string): Set<string> {
  const tags = new Set<string>()
  for (const match of caption
    .normalize("NFC")
    .matchAll(CAPTION_HASHTAG_PATTERN)) {
    tags.add(match[1].toLowerCase())
  }
  return tags
}

/**
 * Whether the caption carries at least one of the target hashtags. Whole-tag
 * only: `#vip2` and `#vipmember` do not match `vip`.
 */
export function captionHasAnyHashtag(
  caption: string,
  hashtags: string[],
): boolean {
  const captionTags = extractCaptionHashtags(caption)
  return normalizeCommentPostHashtags(hashtags).some((tag) =>
    captionTags.has(tag),
  )
}

export function isHashtagCommentAutomation(post: Pick<CommentPost, "type">) {
  return post.type === "hashtags"
}

/**
 * A Live automation answers comments made on any of the account's live
 * broadcasts — and ONLY those: an `all` automation skips a live comment, so a
 * viewer is never answered twice (see `matchPost` in the worker).
 */
export function isLiveCommentAutomation(post: Pick<CommentPost, "type">) {
  return post.type === "live"
}

export type LiveCommentCapabilities = {
  publicReply: boolean
  likeComment: boolean
  hideComments: boolean
  /** Reply delays are allowed — false where the reply window can close mid-wait. */
  replyDelay: boolean
  /** Whether a live comment can itself be a reply to another comment. */
  commentReplies: boolean
}

const FULL_LIVE_CAPABILITIES: LiveCommentCapabilities = {
  publicReply: true,
  likeComment: true,
  hideComments: true,
  replyDelay: true,
  commentReplies: true,
}

/**
 * What a Live automation can do per channel. Meta's Instagram Live API is
 * private-reply-only: "You cannot reply to comments on a live video", live
 * comments cannot be hidden (they are only readable while broadcasting), there
 * is no comment-like API, and the private reply is accepted only while the
 * broadcast is running — so any reply delay risks landing after it ends.
 * Facebook Live comments are ordinary Page comments.
 */
export function liveCommentCapabilities(
  type: CommentAutomationType,
): LiveCommentCapabilities {
  if (type === "instagram" || type === "instagramFacebook") {
    return {
      publicReply: false,
      likeComment: false,
      hideComments: false,
      replyDelay: false,
      commentReplies: false,
    }
  }
  return FULL_LIVE_CAPABILITIES
}

/**
 * "Process missed comments" replays one post's recent comments, so it is only
 * offered on an automation that targets exactly one specific post. Shared by
 * the builder (to hide the action) and the service (to reject the call).
 */
export function canProcessMissedComments(post: CommentPost): boolean {
  return post.type === "postIds" && post.value.length === 1
}

export const commentReplyTypes = z.enum(["AIAgent", "text", "flow", "none"])
export type CommentReplyType = z.infer<typeof commentReplyTypes>

/** Upper bound on a `text` reply's message list, mirrored by the builder form. */
export const COMMENT_REPLY_MAX_TEXTS = 10

export const commentReplySchema = z.object({
  type: commentReplyTypes.describe(
    "Reply kind: `text` (message text), `flow` (run a flow), `AIAgent` (an AI agent writes the reply) or `none` (no reply).",
  ),
  value: z
    .string()
    .nullable()
    .describe(
      "Reply payload by `type`: the message text for `text`, a flow id for `flow` (from `flows.list`), an AI agent id for `AIAgent` (from `aiAgents.list`), or null for `none`.",
    ),
  /**
   * A `text` reply's messages, one public comment reply each. Optional because
   * every row written before this existed carries only `value` — read both
   * through {@link resolveReplyTexts}, never directly.
   *
   * Objects rather than bare strings: this same schema is the form's, the
   * request's and the jsonb column's, and `useFieldArray` needs an object to
   * mint the stable `field.id` the editor is keyed by. Same shape Keywords
   * uses (`features/automated-response/schema/action.ts`).
   *
   * Only `publicReply` fills this in. A private reply stays single-message —
   * Meta accepts one comment-anchored DM per comment.
   */
  values: z
    .array(
      z.object({
        value: z.string().describe("One reply message text."),
      }),
    )
    .max(COMMENT_REPLY_MAX_TEXTS)
    .optional()
    .describe(
      "Public `text` replies only: up to 10 messages, each sent as a separate public reply in order. When set it takes precedence over `value`.",
    ),
})
export type CommentReply = z.infer<typeof commentReplySchema>

/**
 * The messages a reply will actually send, newest shape first and falling back
 * to the legacy single `value`. THE one place that knows the fallback rule —
 * `willSendReply` and `executePublicReply` must both read through it or they
 * disagree about whether an automation replies at all.
 */
export const resolveReplyTexts = (reply: CommentReply): string[] =>
  (reply.values?.map((item) => item.value) ?? [reply.value ?? ""])
    .map((text) => text.trim())
    .filter(Boolean)

/**
 * Keeps `value` and `values` describing the same thing on every write.
 *
 * Without it the two drift: a client that PATCHes only `value` on a row that
 * already has `values` would be ignored outright, because `resolveReplyTexts`
 * prefers `values` — a silent no-op, the worst kind. Mirroring on the way in
 * also means anything still reading `value` (template adapter, public API)
 * keeps seeing real content.
 */
export const normalizeReplyTexts = (reply: CommentReply): CommentReply => {
  if (reply.type !== "text") {
    return reply
  }
  if (reply.values) {
    return { ...reply, value: reply.values[0]?.value ?? "" }
  }
  return { ...reply, values: [{ value: reply.value ?? "" }] }
}

/** Upper bound on the "enough mentions" filter, mirrored by the builder form. */
export const COMMENT_MENTION_COUNT_MAX = 5

export const commentIncludeKeywordsTypes = z.enum([
  "all",
  "equal",
  "contain",
  "mentions",
])
export type CommentIncludeKeywordsType = z.infer<
  typeof commentIncludeKeywordsTypes
>

export const commentIncludeKeywordsSchema = z.object({
  type: commentIncludeKeywordsTypes.describe(
    "Match mode: `all` (every comment), `equal` (comment equals a keyword), `contain` (comment contains a keyword) or `mentions` (comment tags at least `mentionCount` accounts). Matching ignores case and accents.",
  ),
  value: z
    .array(z.string())
    .describe(
      "Keywords for `equal`/`contain`; any one matching is enough. Send `[]` for `all` and `mentions`.",
    ),
  /** Only read when `type` is `mentions`. */
  mentionCount: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMMENT_MENTION_COUNT_MAX)
    .optional()
    .describe(
      "Minimum number of accounts the comment must tag (1-5). Only used when `type` is `mentions`; defaults to 1.",
    ),
})
export type CommentIncludeKeywords = z.infer<
  typeof commentIncludeKeywordsSchema
>
export const commentExcludeKeywordsTypes = z.enum(["equal", "contain"])
export type CommentExcludeKeywordsType = z.infer<
  typeof commentExcludeKeywordsTypes
>

export const commentOptionsSchema = z.object({
  replyToNewContactsOnly: z
    .boolean()
    .describe(
      "Only reply when the commenter is a new contact (no earlier conversation).",
    ),
  replyOncePerUserPerPost: z
    .boolean()
    .describe("Reply at most once per commenter on each post."),
  likeUserComment: z
    .boolean()
    .describe(
      "Also like the comment when replying (where the channel supports likes).",
    ),
  replyToUsersWhoCommentedOnOtherPosts: z
    .boolean()
    .describe(
      "When false, skip commenters this automation already replied to on a different post.",
    ),
  ignoreCommentReplies: z
    .boolean()
    .describe(
      "Ignore replies to other comments; only react to top-level comments.",
    ),
  trackUserTags: z
    .boolean()
    .describe(
      "Count the accounts tagged in each comment into the contact's running totals, exposed as `{{total_tagged}}` and `{{total_new_tagged}}`. Only gates this tag counting; replies and other actions run regardless.",
    ),
  /**
   * Optional because every row written before this existed lacks the key —
   * absent reads as off. Only channels that can see a comment's photo honor it
   * (see `commentAutomationChannelSupportsImageFilter`).
   */
  onlyCommentsWithImage: z
    .boolean()
    .optional()
    .describe(
      "Only reply when the comment has a photo attachment; otherwise this automation skips the comment and the next automation is tried. GIFs and stickers do not count. Facebook and Threads only; ignored on Instagram and TikTok. Omitted means off.",
    ),
})
export type CommentOptions = z.infer<typeof commentOptionsSchema>

/**
 * The channels whose API can delete a comment outright — Meta's
 * `DELETE /{comment-id}` (Facebook, both Instagram logins) and TikTok's
 * `business/comment/delete/`. Threads has no delete endpoint, so AI moderation
 * pins its action to `hide` there.
 *
 * An allowlist: a new channel defaults to "cannot".
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_DELETE = new Set<CommentAutomationType>([
  "messenger",
  "instagram",
  "instagramFacebook",
  "tiktok",
])

export function commentAutomationChannelSupportsDelete(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_DELETE.has(type)
}

export const commentModerationCategories = z.enum([
  "hate",
  "offensive",
  "harassment",
  "negative",
  "spam",
])
export type CommentModerationCategory = z.infer<
  typeof commentModerationCategories
>

/**
 * What each category means, told to whichever model classifies the comment —
 * one source so an AI agent and an AI Router judge the same thing.
 */
export const COMMENT_MODERATION_CATEGORY_DESCRIPTIONS: Record<
  CommentModerationCategory,
  string
> = {
  hate: "hate speech or discrimination against a group (race, religion, gender, nationality, disability, orientation…)",
  offensive: "insults, profanity, vulgar or obscene language",
  harassment: "threats, bullying, or targeted attacks on a person",
  negative:
    "hostile attacks on the brand or business meant to damage it (not ordinary complaints or questions)",
  spam: "scams, phishing, or unrelated self-promotion",
}

export const commentModerationActions = z.enum(["hide", "delete"])
export type CommentModerationAction = z.infer<typeof commentModerationActions>

export const COMMENT_MODERATION_INSTRUCTION_MAX_LENGTH = 1000

/**
 * The AI Router engine sends the guidance inside each question's
 * instructions, which the provider caps at 1000 characters together with the
 * fixed moderation text (up to ~430), so its guidance is shorter.
 */
export const COMMENT_MODERATION_DECISION_INSTRUCTION_MAX_LENGTH = 500

/**
 * What classifies the comment: an AI agent's chat model, or an AI Router
 * (Decision, e.g. Jev) connection asked one yes/no question per category.
 */
export const commentModerationEngines = z.enum(["aiAgent", "decision"])
export type CommentModerationEngine = z.infer<typeof commentModerationEngines>

/** Probability at or above which an AI Router answer blocks a category. */
export const COMMENT_MODERATION_DEFAULT_DECISION_THRESHOLD = 0.7

export const commentAIModerationSchema = z
  .object({
    enabled: z
      .boolean()
      .describe("Let an AI model check every comment before replying."),
    /**
     * Optional because every row written before AI Router moderation existed
     * lacks the key — absent reads as `aiAgent`.
     */
    engine: commentModerationEngines
      .optional()
      .describe(
        "What classifies the comment: `aiAgent` (an AI agent's model, set `aiAgentId`) or `decision` (an AI Router connection such as Jev, set `decisionConnectionId` and `decisionModel`). Omitted means `aiAgent`.",
      ),
    aiAgentId: z
      .string()
      .nullable()
      .describe(
        "AI agent whose model classifies the comment (from `aiAgents.list`). Only its model is used, not its prompt. Required when `enabled` is true and `engine` is `aiAgent`.",
      ),
    decisionConnectionId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "AI Router connection that classifies the comment (from `decisionConnections.list`, must be enabled). Required when `enabled` is true and `engine` is `decision`.",
      ),
    decisionModel: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Model of `decisionConnectionId` to ask, one of the connection's `modelCatalog` (e.g. `jev-1.13.0`). Required when `enabled` is true and `engine` is `decision`.",
      ),
    decisionThreshold: z
      .number()
      .min(0.5)
      .max(0.95)
      .optional()
      .describe(
        "With `engine` `decision`: the probability (0.5–0.95) at or above which a category counts as matched. Omitted means 0.7.",
      ),
    categories: z
      .array(commentModerationCategories)
      .describe(
        "What to block: `hate` (hate speech, discrimination), `offensive` (insults, profanity), `harassment` (threats, bullying), `negative` (hostile attacks on the brand), `spam` (scams, unrelated promotion). At least one when `enabled` is true.",
      ),
    instruction: z
      .string()
      .max(COMMENT_MODERATION_INSTRUCTION_MAX_LENGTH)
      .optional()
      .describe(
        "Extra guidance for the AI, e.g. 'Do not block customers complaining about price'. At most 1000 characters, 500 with `engine` `decision`.",
      ),
    action: commentModerationActions.describe(
      "What to do with a blocked comment: `hide` (reversible) or `delete` (permanent). `delete` is stored as `hide` on Threads, which cannot delete.",
    ),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return
    }
    if (resolveModerationEngine(value) === "decision") {
      if (!value.decisionConnectionId) {
        ctx.addIssue({
          code: "custom",
          path: ["decisionConnectionId"],
          message: "Choose an AI Router connection",
        })
      }
      if (!value.decisionModel) {
        ctx.addIssue({
          code: "custom",
          path: ["decisionModel"],
          message: "Choose a model",
        })
      }
      if (
        (value.instruction?.trim().length ?? 0) >
        COMMENT_MODERATION_DECISION_INSTRUCTION_MAX_LENGTH
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["instruction"],
          message: `At most ${COMMENT_MODERATION_DECISION_INSTRUCTION_MAX_LENGTH} characters with AI Router`,
        })
      }
    } else if (!value.aiAgentId) {
      ctx.addIssue({
        code: "custom",
        path: ["aiAgentId"],
        message: "Choose an AI agent",
      })
    }
    if (value.categories.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Choose at least one category",
      })
    }
  })
export type CommentAIModeration = z.infer<typeof commentAIModerationSchema>

/** The stored engine; a row written before `engine` existed is `aiAgent`. */
export function resolveModerationEngine(
  aiModeration: CommentAIModeration,
): CommentModerationEngine {
  return aiModeration.engine ?? "aiAgent"
}

/** The probability an AI Router answer must reach to block a category. */
export function resolveDecisionThreshold(
  aiModeration: Pick<CommentAIModeration, "decisionThreshold">,
): number {
  return (
    aiModeration.decisionThreshold ??
    COMMENT_MODERATION_DEFAULT_DECISION_THRESHOLD
  )
}

/** On, with at least one category and the chosen engine fully configured. */
export function isAIModerationEnabled(
  aiModeration: CommentAIModeration | undefined,
): aiModeration is CommentAIModeration {
  if (!aiModeration?.enabled || aiModeration.categories.length === 0) {
    return false
  }
  if (resolveModerationEngine(aiModeration) === "decision") {
    return Boolean(
      aiModeration.decisionConnectionId && aiModeration.decisionModel,
    )
  }
  return Boolean(aiModeration.aiAgentId)
}

export const commentHideCommentsSchema = z.object({
  all: z.boolean().describe("Hide every matching comment."),
  hasPhoneNumber: z
    .boolean()
    .describe("Hide comments containing a phone number."),
  hasImage: z
    .boolean()
    .describe("Hide comments with an image attachment (Facebook only)."),
  hasVideo: z
    .boolean()
    .describe("Hide comments with a video attachment (Facebook only)."),
  hasLink: z.boolean().describe("Hide comments containing a link."),
  hasKeywords: z
    .boolean()
    .describe("Hide comments containing any word in `keywords`."),
  /**
   * Optional because every row written before these existed lacks the key —
   * absent reads as off. GIF detection needs attachment data only some
   * channels expose (see `commentAutomationChannelSupportsHideGif`).
   */
  hasGif: z
    .boolean()
    .optional()
    .describe(
      "Hide comments containing a GIF. Only Facebook and Threads detect GIFs; ignored on other channels. Omitted means off.",
    ),
  hasEmoji: z
    .boolean()
    .optional()
    .describe("Hide comments containing an emoji. Omitted means off."),
  /**
   * Optional for the same reason as `hasGif`: rows written before AI
   * moderation existed lack the key, and absent reads as off.
   */
  aiModeration: commentAIModerationSchema
    .optional()
    .describe(
      "AI moderation: an AI agent's model or an AI Router connection (see `engine`) reads each comment and hides or deletes the ones in the chosen categories. Runs before the reply filters; a moderated comment is never replied to. Omitted means off.",
    ),
  keywords: z
    .array(z.string())
    .describe("Words that trigger hiding when `hasKeywords` is true."),
  showCommentsAfter: z
    .enum([
      "none",
      "6h",
      "12h",
      "1d",
      "2d",
      "3d",
      "4d",
      "5d",
      "6d",
      "7d",
      "8d",
      "9d",
      "10d",
    ])
    .describe(
      "Unhide hidden comments after this delay: `none` (keep hidden), `6h`, `12h`, or `1d` to `10d`.",
    ),
})
export type CommentHideComments = z.infer<typeof commentHideCommentsSchema>

export const commentReplyAfterSchema = z.object({
  type: z
    .enum([
      "immediately",
      "seconds",
      "minutes",
      "hours",
      "randomWithin3Minutes",
      "randomWithin5Minutes",
      "randomWithin10Minutes",
      "randomWithin20Minutes",
      "randomWithin30Minutes",
      "randomWithin60Minutes",
    ])
    .describe(
      "Delay mode: `immediately`, a fixed wait in `seconds`/`minutes`/`hours` (amount in `value`), or a random wait up to the stated number of minutes.",
    ),
  value: z.coerce
    .number()
    .describe(
      "Wait amount in the unit named by `type`. Only used for `seconds`, `minutes` and `hours`; send 0 otherwise.",
    ),
})
export type CommentReplyAfter = z.infer<typeof commentReplyAfterSchema>
