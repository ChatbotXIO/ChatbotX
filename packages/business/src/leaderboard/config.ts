import {
  LEADERBOARD_MAX_DURATION_SECONDS,
  LEADERBOARD_POST_TRACKING_PLATFORMS,
  LEADERBOARD_RULES_BY_PLATFORM,
  type LeaderboardPlatform,
  type LeaderboardRule,
  type LeaderboardRuleKey,
  type LeaderboardRules,
  type LeaderboardScope,
  leaderboardRuleSchema,
} from "@chatbotx.io/database/partials"
import { validationException } from "../errors"

const COMMENT_ONLY_FIELDS = ["minChars", "bonusPoints", "bonusMinutes"] as const

const tracksPosts = (platform: LeaderboardPlatform) =>
  (LEADERBOARD_POST_TRACKING_PLATFORMS as readonly string[]).includes(platform)

const disabledRule = (): LeaderboardRule => leaderboardRuleSchema.parse({})

type RuleDefaults = Partial<
  Record<LeaderboardRuleKey, Partial<LeaderboardRule>>
>

/** Spec defaults per platform; rules not listed start disabled at 0 points. */
const PLATFORM_RULE_DEFAULTS: Record<LeaderboardPlatform, RuleDefaults> = {
  messenger: {
    comments: { enabled: true, points: 30, minChars: 30, bonusMinutes: 60 },
    liveComments: { enabled: true, points: 300 },
    referral: { enabled: true, points: 50, maxPerDay: 10 },
  },
  instagram: {
    comments: { enabled: true, points: 30, minChars: 20 },
    storyMention: { enabled: true, points: 100, maxPerDay: 2 },
    referral: { enabled: true, points: 50, maxPerDay: 10 },
  },
  whatsapp: { referral: { enabled: true, points: 50, maxPerDay: 10 } },
  zalo: {
    message: { maxPerDay: 2 },
    referral: { enabled: true, points: 50, maxPerDay: 10 },
  },
  telegram: { referral: { enabled: true, points: 50, maxPerDay: 10 } },
  tiktok: { comments: { enabled: true, points: 30, minChars: 20 } },
  threads: { comments: { enabled: true, points: 30, minChars: 20 } },
  email: { emailClick: { maxPerDay: 2 } },
  gamification: { referral: { enabled: true, points: 50, maxPerDay: 10 } },
}

/**
 * Default rule set for a platform, using the values from the product spec
 * (e.g. 30 pts per comment, 30-char minimum, 60-minute golden hour). Rules
 * the spec leaves blank start disabled with 0 points for the admin to fill.
 */
export function defaultLeaderboardRules(
  platform: LeaderboardPlatform,
): LeaderboardRules {
  const defaults = PLATFORM_RULE_DEFAULTS[platform]
  const rules: LeaderboardRules = {}
  for (const key of LEADERBOARD_RULES_BY_PLATFORM[platform]) {
    rules[key] = { ...disabledRule(), ...defaults[key] }
  }
  return rules
}

/**
 * Validates the cross-field rules Zod cannot express on its own: rules must
 * belong to the platform, enabled rules need points, comment-only knobs only
 * on comment rules, a host channel (or minigame) is required, and the time
 * window must fit the Redis rank encoding. Throws a field-scoped
 * `validationException` so the builder form and the public API surface the
 * same message.
 */
export function assertValidLeaderboardConfig(input: {
  platform: LeaderboardPlatform
  inboxId: string | null
  minigameId: string | null
  rules: LeaderboardRules
  scope: LeaderboardScope
  startsAt: Date
  endsAt: Date
}): void {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw validationException("endsAt", "End time must be after start time")
  }
  const durationSeconds =
    (input.endsAt.getTime() - input.startsAt.getTime()) / 1000
  if (durationSeconds > LEADERBOARD_MAX_DURATION_SECONDS) {
    throw validationException(
      "endsAt",
      "A leaderboard can run for at most 3 years",
    )
  }

  if (input.platform === "gamification") {
    if (!input.minigameId) {
      throw validationException("minigameId", "Choose a minigame")
    }
  } else if (!input.inboxId) {
    throw validationException("inboxId", "Choose a channel")
  }

  const allowed = new Set<string>(LEADERBOARD_RULES_BY_PLATFORM[input.platform])
  for (const [key, rule] of Object.entries(input.rules)) {
    if (!rule) {
      continue
    }
    if (!allowed.has(key)) {
      throw validationException(
        `rules.${key}`,
        `Rule "${key}" is not available on ${input.platform}`,
      )
    }
    if (rule.enabled && rule.points <= 0) {
      throw validationException(
        `rules.${key}.points`,
        "Enter the points this rule awards",
      )
    }
    if (key !== "comments") {
      for (const field of COMMENT_ONLY_FIELDS) {
        if (rule[field] !== null && rule[field] !== undefined) {
          throw validationException(
            `rules.${key}.${field}`,
            `"${field}" only applies to the comments rule`,
          )
        }
      }
    }
    if (
      key === "comments" &&
      !tracksPosts(input.platform) &&
      ((rule.bonusPoints ?? 0) > 0 || rule.bonusMinutes)
    ) {
      throw validationException(
        "rules.comments.bonusPoints",
        `The golden-hour bonus is not available on ${input.platform}`,
      )
    }
    if (
      key === "comments" &&
      (rule.bonusPoints ?? 0) > 0 &&
      !rule.bonusMinutes
    ) {
      throw validationException(
        "rules.comments.bonusMinutes",
        "Set how many minutes the golden-hour bonus lasts",
      )
    }
  }

  if (input.scope.postScope === "specific") {
    if (!tracksPosts(input.platform)) {
      throw validationException(
        "scope.postScope",
        `Scoring specific posts is not available on ${input.platform}`,
      )
    }
    if (input.scope.postIds.length === 0) {
      throw validationException("scope.postIds", "Choose at least one post")
    }
  }
  if (
    input.platform === "telegram" &&
    input.scope.telegramChatIds.length === 0 &&
    (input.rules.joinGroup?.enabled || input.rules.groupDiscussion?.enabled)
  ) {
    throw validationException(
      "scope.telegramChatIds",
      "Choose at least one Telegram group or channel",
    )
  }
}

/**
 * Whether the campaign window contains `at`. The window ends at `endsAt`, or
 * earlier when an admin finished the leaderboard early (`finishedAt`).
 */
export const isWithinLeaderboardWindow = (
  leaderboard: { startsAt: Date; endsAt: Date; finishedAt?: Date | null },
  at: Date,
): boolean => {
  const endsAt = Math.min(
    leaderboard.endsAt.getTime(),
    leaderboard.finishedAt?.getTime() ?? Number.POSITIVE_INFINITY,
  )
  return at.getTime() >= leaderboard.startsAt.getTime() && at.getTime() < endsAt
}
