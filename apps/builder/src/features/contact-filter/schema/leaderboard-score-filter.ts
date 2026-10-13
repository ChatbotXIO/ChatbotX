import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const LEADERBOARD_SCORE_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.lt,
  operatorTypes.enum.lte,
  operatorTypes.enum.gt,
  operatorTypes.enum.gte,
] as const satisfies readonly OperatorType[]

/**
 * "Gamification scores" condition: compares the contact's score on one
 * leaderboard (a contact who never scored counts as 0). Like coupon topics,
 * each workspace leaderboard becomes its own filter field at runtime, so a
 * single `field: "leaderboardScore"` branch carries the runtime
 * `leaderboardId`.
 */
export const leaderboardScoreConditionSchema = z
  .object({
    field: z
      .literal("leaderboardScore")
      .describe(
        "Always `leaderboardScore` for a gamification score condition.",
      ),
    leaderboardId: z
      .string()
      .min(1)
      .describe("Leaderboard id. Get it from `leaderboards.list`."),
    operator: operatorTypes.describe(
      "Allowed: `eq`, `lt`, `lte`, `gt`, `gte` against the score in `value`.",
    ),
    value: z.coerce
      .string()
      .describe("Score to compare with (integer, sent as a number or string)."),
  })
  .superRefine((condition, ctx) => {
    if (
      !(LEADERBOARD_SCORE_OPERATORS as readonly OperatorType[]).includes(
        condition.operator,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Operator is not supported for this field",
        path: ["operator"],
      })
      return
    }
    const score = Number(condition.value)
    if (condition.value === "" || !Number.isFinite(score)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a score",
        path: ["value"],
      })
    }
  })

export type LeaderboardScoreCondition = z.infer<
  typeof leaderboardScoreConditionSchema
>
