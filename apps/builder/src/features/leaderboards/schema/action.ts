import {
  leaderboardPlatforms,
  leaderboardResetTimeSchema,
  leaderboardRewardSettingsSchema,
  leaderboardRulesSchema,
  leaderboardScopeSchema,
  leaderboardStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/**
 * Leaderboard configuration shared by the create wizard, the edit form and
 * the public API, so the three can never accept different shapes.
 * Cross-field rules (rules per platform, points when enabled, time window)
 * are enforced once in `assertValidLeaderboardConfig` in
 * `@chatbotx.io/business/leaderboard`.
 */
export const leaderboardConfigRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .describe("Leaderboard title shown on the public page, 1-150 characters."),
  description: z
    .string()
    .max(5000)
    .default("")
    .describe(
      "Rules and rewards text shown to players, up to 5000 characters.",
    ),
  coverImageUrl: z
    .string()
    .max(2000)
    .default("")
    .describe(
      "Public URL of the 16:9 cover banner (1200×630 recommended). Empty for none.",
    ),
  startsAt: z.coerce
    .date()
    .describe("When scoring opens, ISO 8601 (e.g. 2026-10-01T00:00:00Z)."),
  endsAt: z.coerce
    .date()
    .describe(
      "When scores freeze, ISO 8601. Must be after startsAt; at most 3 years later.",
    ),
  platform: leaderboardPlatforms.describe(
    "The single platform players compete on. Cannot change after publishing.",
  ),
  inboxId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Host channel (inbox) whose events score; required for every platform except gamification. Must match the platform (email → SMTP inbox). Get ids from `inboxes.list`.",
    ),
  minigameId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Gamification only: the minigame whose wins/shares score. Get ids from `minigames.list`.",
    ),
  scope: leaderboardScopeSchema
    .default({
      postScope: "all",
      postIds: [],
      telegramChatIds: [],
    })
    .describe(
      "Where events score: which posts (Messenger/Instagram) or Telegram groups. Defaults to every post.",
    ),
  rules: leaderboardRulesSchema.describe(
    "Scoring rules for the platform. Get a filled-in starting point from `leaderboards.defaultRules`.",
  ),
  followersOnly: z
    .boolean()
    .default(false)
    .describe(
      "Only contacts who follow the host account score. Honored on instagram, zalo and telegram only.",
    ),
  tagIds: z
    .array(zodBigintAsString())
    .max(50)
    .default([])
    .describe(
      "Only contacts with at least one of these tags score; empty means everyone. Get ids from `tags.list`.",
    ),
  resetTime: leaderboardResetTimeSchema.default("22:00"),
  cooldownSeconds: z
    .int()
    .min(0)
    .max(86_400)
    .default(0)
    .describe(
      "Anti-spam: minimum seconds between two automatic awards for the same contact. 0 disables it.",
    ),
  referralWelcomeFlowId: zodBigintAsString()
    .nullable()
    .default(null)
    .describe(
      "Flow sent to a friend who arrives through a player's referral link (use `{{referral_name}}` in it). Get ids from `flows.list`.",
    ),
  rewardSettings: leaderboardRewardSettingsSchema
    .default({
      flowId: null,
      topN: 3,
      autoOnFinish: false,
    })
    .describe(
      "Reward flow sent to the top N when the leaderboard finishes (automatically or via `leaderboards.triggerRewards`).",
    ),
})
export type LeaderboardConfigRequest = z.infer<typeof leaderboardConfigRequest>

export const leaderboardIdInput = z.object({
  id: zodBigintAsString().describe(
    "Leaderboard id. Get it from `leaderboards.list`.",
  ),
})

export const leaderboardContactInput = leaderboardIdInput.extend({
  contactId: zodBigintAsString().describe(
    "Participant's contact id. Get it from `leaderboards.participants.list`.",
  ),
})

export const adjustLeaderboardScoreRequest = leaderboardContactInput.extend({
  delta: z
    .int()
    .refine((value) => value !== 0, "Enter a non-zero number of points")
    .describe("Points to add (positive) or subtract (negative)."),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Why the score is changed; required and kept in the audit log."),
})

export const leaderboardReasonRequest = leaderboardContactInput.extend({
  reason: z
    .string()
    .trim()
    .max(500)
    .default("")
    .describe("Optional note kept in the audit log."),
})

export const resetLeaderboardPointsRequest = leaderboardIdInput.extend({
  reason: z
    .string()
    .trim()
    .max(500)
    .default("")
    .describe("Optional note kept in the audit log."),
})

export const listLeaderboardsFilter = z.object({
  status: leaderboardStatuses
    .optional()
    .describe("Only leaderboards in this status."),
  platform: leaderboardPlatforms
    .optional()
    .describe("Only leaderboards on this platform."),
  keyword: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the name."),
})

export const leaderboardParticipantFilters = z.enum([
  "all",
  "top10",
  "top50",
  "banned",
])
