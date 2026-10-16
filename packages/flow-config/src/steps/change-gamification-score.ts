import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const gamificationScoreOperations = z.enum(["add", "subtract"])
export type GamificationScoreOperation = z.infer<
  typeof gamificationScoreOperations
>

/**
 * "Change gamification scores": adds/subtracts points on a leaderboard for
 * the chatting contact and/or the contact who referred them. Ignored while
 * the leaderboard is paused or finished (spec: bot scoring is blocked then).
 */
export const changeGamificationScoreStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.changeGamificationScore)
    .describe('Step type discriminator: "changeGamificationScore".'),
  leaderboardId: z
    .string()
    .optional()
    .describe("Leaderboard to score. Get ids from `leaderboards.list`."),
  operation: gamificationScoreOperations
    .default("add")
    .describe('"add" or "subtract" points.'),
  points: z
    .int()
    .min(1)
    .max(1_000_000)
    .default(10)
    .describe("How many points, 1-1,000,000."),
  targetUser: z
    .boolean()
    .default(true)
    .describe("Change the chatting contact's score (User scores)."),
  targetReferrer: z
    .boolean()
    .default(false)
    .describe(
      "Change the score of whoever referred this contact into the leaderboard (Referent scores).",
    ),
})

export type ChangeGamificationScoreStepSchema = z.infer<
  typeof changeGamificationScoreStepSchema
>

export const changeGamificationScoreStepDefaultFn =
  (): ChangeGamificationScoreStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.changeGamificationScore,
    leaderboardId: undefined,
    operation: "add",
    points: 10,
    targetUser: true,
    targetReferrer: false,
  })
