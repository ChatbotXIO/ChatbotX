import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const leaderboardStatuses = z.enum([
  "draft",
  "active",
  "paused",
  "finished",
])
export type LeaderboardStatus = z.infer<typeof leaderboardStatuses>

/**
 * One platform per leaderboard (never merged): each platform identifies a
 * person by its own id (PSID, IGSID, Zalo id, phone, Telegram id), so mixing
 * them would split one human into several competitors.
 */
export const leaderboardPlatforms = z.enum([
  "messenger",
  "instagram",
  "whatsapp",
  "zalo",
  "telegram",
  "email",
  "gamification",
])
export type LeaderboardPlatform = z.infer<typeof leaderboardPlatforms>

export const leaderboardRuleKeys = z.enum([
  "comments",
  "liveComments",
  "keywords",
  "storyMention",
  "storyReaction",
  "ctwaReactions",
  "survey",
  "follow",
  "message",
  "joinGroup",
  "groupDiscussion",
  "emailOpen",
  "emailClick",
  "minigameWin",
  "inGameShare",
  "referral",
])
export type LeaderboardRuleKey = z.infer<typeof leaderboardRuleKeys>

/** The scoring rules each platform offers, in display order. */
export const LEADERBOARD_RULES_BY_PLATFORM = {
  messenger: ["comments", "liveComments", "keywords", "referral"],
  instagram: [
    "comments",
    "storyMention",
    "storyReaction",
    "keywords",
    "referral",
  ],
  whatsapp: ["ctwaReactions", "survey", "referral"],
  zalo: ["follow", "message", "referral"],
  telegram: ["joinGroup", "groupDiscussion", "referral"],
  email: ["emailOpen", "emailClick"],
  gamification: ["minigameWin", "inGameShare", "referral"],
} as const satisfies Record<LeaderboardPlatform, readonly LeaderboardRuleKey[]>

/** Rules whose points are taken back when the triggering state is undone (unfollow, leaving a group). */
export const LEADERBOARD_REVERSIBLE_RULES = [
  "follow",
  "joinGroup",
] as const satisfies readonly LeaderboardRuleKey[]

/** Platforms whose API can tell whether a contact follows/belongs to the host account. */
export const LEADERBOARD_FOLLOWER_CHECK_PLATFORMS = [
  "instagram",
  "zalo",
  "telegram",
] as const satisfies readonly LeaderboardPlatform[]

/**
 * Upper bounds that keep the Redis rank value exact: the sorted-set score is
 * `score * 1e8 + (99_999_999 - secondsSinceStart)`, a double that is exact
 * only below 2^53. See `packages/redis/src/leaderboard-store.ts`.
 */
export const LEADERBOARD_MAX_SCORE = 89_999_999
export const LEADERBOARD_MAX_DURATION_SECONDS = 99_999_999

const MAX_RULE_POINTS = 1_000_000

export const leaderboardRuleSchema = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe("Whether this rule awards points. Defaults to false."),
  points: z
    .int()
    .min(0)
    .max(MAX_RULE_POINTS)
    .default(0)
    .describe(
      "Points awarded each time the action happens, 0-1,000,000. Required (> 0) when enabled.",
    ),
  maxPerDay: z
    .int()
    .min(1)
    .max(100_000)
    .nullable()
    .default(null)
    .describe(
      "Maximum times per contact per day this rule can award points; the day restarts at `resetTime`. null means unlimited.",
    ),
  minChars: z
    .int()
    .min(0)
    .max(2000)
    .nullable()
    .default(null)
    .describe(
      "Comments rule only: minimum comment length in characters for the comment to score (anti-spam). null means no minimum.",
    ),
  bonusPoints: z
    .int()
    .min(0)
    .max(MAX_RULE_POINTS)
    .nullable()
    .default(null)
    .describe(
      "Comments rule only: extra 'golden hour' points added when the comment arrives within `bonusMinutes` of the post being published.",
    ),
  bonusMinutes: z
    .int()
    .min(1)
    .max(10_080)
    .nullable()
    .default(null)
    .describe(
      "Comments rule only: length of the golden-hour window in minutes after the post is published.",
    ),
})
export type LeaderboardRule = z.infer<typeof leaderboardRuleSchema>

export const leaderboardRulesSchema = z
  .partialRecord(leaderboardRuleKeys, leaderboardRuleSchema)
  .describe(
    "Scoring rules keyed by rule name. Only the rules offered by the leaderboard's platform are accepted: messenger (comments, liveComments, keywords, referral), instagram (comments, storyMention, storyReaction, keywords, referral), whatsapp (ctwaReactions, survey, referral), zalo (follow, message, referral), telegram (joinGroup, groupDiscussion, referral), email (emailOpen, emailClick), gamification (minigameWin, inGameShare, referral).",
  )
export type LeaderboardRules = z.infer<typeof leaderboardRulesSchema>

export const leaderboardPostScopes = z.enum(["all", "specific"])
export type LeaderboardPostScope = z.infer<typeof leaderboardPostScopes>

export const leaderboardScopeSchema = z.object({
  postScope: leaderboardPostScopes
    .default("all")
    .describe(
      'Messenger/Instagram only: "all" scores comments on every post, "specific" only on `postIds`. Defaults to "all".',
    ),
  postIds: z
    .array(z.string().trim().min(1).max(200))
    .max(200)
    .default([])
    .describe(
      'Post/reel ids whose comments score when postScope is "specific". Defaults to none.',
    ),
  telegramChatIds: z
    .array(z.string().trim().min(1).max(50))
    .max(50)
    .default([])
    .describe(
      "Telegram only: ids of the groups/channels (where the bot is an admin) whose joins and messages score. Defaults to none.",
    ),
})
export type LeaderboardScope = z.infer<typeof leaderboardScopeSchema>

export const leaderboardRewardSettingsSchema = z.object({
  flowId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Flow sent to each top winner when rewards are triggered. Get ids from `flows.list`. null means rewards are not configured.",
    ),
  topN: z
    .int()
    .min(1)
    .max(1000)
    .default(3)
    .describe(
      "How many top-ranked participants receive the reward flow, 1-1000. Defaults to 3.",
    ),
  autoOnFinish: z
    .boolean()
    .default(false)
    .describe(
      "Whether rewards are sent automatically when the leaderboard finishes. Defaults to false.",
    ),
})
export type LeaderboardRewardSettings = z.infer<
  typeof leaderboardRewardSettingsSchema
>

export const leaderboardResetTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe(
    'UTC time ("HH:mm") at which each contact\'s daily rule counters restart. Defaults to "22:00" (05:00 Vietnam time).',
  )

/** Source of one score change in `LeaderboardScoreEvent.source`. */
export const leaderboardScoreSources = z.enum([
  "rule",
  "flow",
  "referral",
  "manual",
  "reset",
])
export type LeaderboardScoreSource = z.infer<typeof leaderboardScoreSources>

export const leaderboardAuditActions = z.enum([
  "adjust",
  "resetOne",
  "resetAll",
  "ban",
  "unban",
])
export type LeaderboardAuditAction = z.infer<typeof leaderboardAuditActions>

/** Lifetime per-rule counters shown as "42 comments • 5 ref" in the participants table. */
export type LeaderboardBreakdown = Partial<
  Record<LeaderboardRuleKey | "flow" | "manual", number>
>

/** Per-rule counters for the current day bucket (see `LeaderboardParticipant.dailyBucket`). */
export type LeaderboardDailyCounts = Partial<Record<LeaderboardRuleKey, number>>
