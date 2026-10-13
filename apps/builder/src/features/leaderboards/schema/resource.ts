import {
  leaderboardAuditActions,
  leaderboardPlatforms,
  leaderboardRewardSettingsSchema,
  leaderboardRulesSchema,
  leaderboardScopeSchema,
  leaderboardStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const leaderboardStatsResource = z.object({
  participants: z
    .number()
    .describe("Contacts with at least one scored action."),
  totalPoints: z.number().describe("Sum of every participant's score."),
  newToday: z
    .number()
    .describe("Participants who joined since the last daily reset."),
})

export const leaderboardActionNames = z.enum([
  "edit",
  "publish",
  "pause",
  "start",
  "finish",
  "resetPoints",
  "export",
  "triggerRewards",
  "delete",
])

export const leaderboardResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  description: z.string(),
  coverImageUrl: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: leaderboardStatuses,
  platform: leaderboardPlatforms,
  inboxId: zodBigintAsString().nullable(),
  minigameId: zodBigintAsString().nullable(),
  scope: leaderboardScopeSchema,
  rules: leaderboardRulesSchema,
  followersOnly: z.boolean(),
  tagIds: z.array(z.string()),
  resetTime: z.string(),
  cooldownSeconds: z.number(),
  referralWelcomeFlowId: zodBigintAsString().nullable(),
  rewardSettings: leaderboardRewardSettingsSchema,
  rewardsTriggeredAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  stats: leaderboardStatsResource,
  availableActions: z
    .array(leaderboardActionNames)
    .describe("Operations allowed in the current status."),
  viewUrl: z
    .string()
    .describe(
      "Public leaderboard page. Send it from a flow as-is: `{{leaderboard_view_token}}` is filled per contact so the page shows their rank and referral link; opened elsewhere it shows the board without a personal bar.",
    ),
})

export const leaderboardParticipantResource = z.object({
  contactId: zodBigintAsString(),
  rank: z.number().nullable().describe("1-based rank; null when banned."),
  score: z.number(),
  isBanned: z.boolean(),
  breakdown: z
    .record(z.string(), z.number())
    .describe("Lifetime count per rule, e.g. { comments: 42, referral: 5 }."),
  referrerContactId: zodBigintAsString().nullable(),
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
  phoneNumber: z
    .string()
    .nullable()
    .describe("Masked phone (only the last 3 digits are visible)."),
  lastActivityAt: z.date(),
  createdAt: z.date(),
})

export const leaderboardAuditEntryResource = z.object({
  id: zodBigintAsString(),
  createdAt: z.date(),
  action: leaderboardAuditActions,
  delta: z.number(),
  reason: z.string(),
  contact: z
    .object({
      id: zodBigintAsString(),
      fullName: z.string().nullable(),
      avatar: z.string().nullable(),
    })
    .nullable(),
  actor: z
    .object({
      id: zodBigintAsString(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable()
    .describe("Builder user who made the change; null when made via the API."),
})

export const leaderboardTopEntryResource = z.object({
  rank: z.number(),
  contactId: zodBigintAsString(),
  score: z.number(),
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
})
