import type {
  LeaderboardPlatform,
  LeaderboardRuleKey,
  LeaderboardRules,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { leaderboardConfigRequest } from "../schema/action"
import { supportsPostScope } from "./platforms"

/** Localized messages for the cross-field checks (built from `t` by the wizard). */
export type LeaderboardWizardMessages = {
  nameRequired: string
  dateRequired: string
  endsAfterStart: string
  channelRequired: string
  minigameRequired: string
  pointsRequired: string
  bonusMinutesRequired: string
  postsRequired: string
  telegramChatsRequired: string
}

/** Fields each wizard step owns — "Continue" validates only these. */
export const STEP_ONE_FIELDS = [
  "name",
  "coverImageUrl",
  "description",
  "startsAt",
  "endsAt",
] as const

export const STEP_TWO_FIELDS = [
  "platform",
  "inboxId",
  "minigameId",
  "scope",
  "rules",
  "followersOnly",
  "tagIds",
  "resetTime",
  "cooldownSeconds",
  "referralWelcomeFlowId",
  "rewardSettings",
] as const

/**
 * The wizard's form schema: the shared `leaderboardConfigRequest` plus the
 * cross-field checks the service enforces (`assertValidLeaderboardConfig`),
 * so "Continue" catches them before the request is sent.
 */
export function buildLeaderboardWizardSchema(
  messages: LeaderboardWizardMessages,
) {
  return leaderboardConfigRequest
    .extend({
      name: z.string().trim().min(1, messages.nameRequired).max(150),
      startsAt: z.coerce.date({ error: messages.dateRequired }),
      endsAt: z.coerce.date({ error: messages.dateRequired }),
    })
    .superRefine((values, context) => {
      if (values.endsAt.getTime() <= values.startsAt.getTime()) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: messages.endsAfterStart,
        })
      }
      if (values.platform === "gamification") {
        if (!values.minigameId) {
          context.addIssue({
            code: "custom",
            path: ["minigameId"],
            message: messages.minigameRequired,
          })
        }
      } else if (!values.inboxId) {
        context.addIssue({
          code: "custom",
          path: ["inboxId"],
          message: messages.channelRequired,
        })
      }
      for (const [key, rule] of Object.entries(values.rules)) {
        if (rule?.enabled && rule.points <= 0) {
          context.addIssue({
            code: "custom",
            path: ["rules", key, "points"],
            message: messages.pointsRequired,
          })
        }
      }
      const comments = values.rules.comments
      if (
        comments &&
        (comments.bonusPoints ?? 0) > 0 &&
        !comments.bonusMinutes
      ) {
        context.addIssue({
          code: "custom",
          path: ["rules", "comments", "bonusMinutes"],
          message: messages.bonusMinutesRequired,
        })
      }
      if (
        supportsPostScope(values.platform) &&
        values.scope.postScope === "specific" &&
        values.scope.postIds.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["scope", "postIds"],
          message: messages.postsRequired,
        })
      }
      if (
        values.platform === "telegram" &&
        values.scope.telegramChatIds.length === 0 &&
        (values.rules.joinGroup?.enabled ||
          values.rules.groupDiscussion?.enabled)
      ) {
        context.addIssue({
          code: "custom",
          path: ["scope", "telegramChatIds"],
          message: messages.telegramChatsRequired,
        })
      }
    })
}

export type LeaderboardWizardSchema = ReturnType<
  typeof buildLeaderboardWizardSchema
>
export type LeaderboardWizardInput = z.input<LeaderboardWizardSchema>
export type LeaderboardWizardOutput = z.output<LeaderboardWizardSchema>

/** Default rules per platform, computed server-side by `leaderboardService.defaultRules`. */
export type LeaderboardDefaultRules = Record<
  LeaderboardPlatform,
  LeaderboardRules
>

export const hasEnabledRule = (rules: LeaderboardRules) =>
  Object.values(rules).some((rule) => rule?.enabled)

export const enabledRuleKeys = (rules: LeaderboardRules) =>
  (
    Object.entries(rules) as [
      LeaderboardRuleKey,
      LeaderboardRules[LeaderboardRuleKey],
    ][]
  )
    .filter(([, rule]) => rule?.enabled)
    .map(([key]) => key)

/** Which wizard step shows a field, for jumping back to a server-side error. */
export function stepOfField(field: string): 1 | 2 {
  const root = field.split(".")[0] ?? ""
  return (STEP_ONE_FIELDS as readonly string[]).includes(root) ? 1 : 2
}
