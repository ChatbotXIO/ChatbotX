import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const reactionStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.reaction),
  emoji: z.string().min(1).max(10),
})

export type ReactionStepSchema = z.infer<typeof reactionStepSchema>

export const reactionStepDefaultFn = (
  props?: Partial<ReactionStepSchema>,
): ReactionStepSchema => ({
  id: createId(),
  emoji: "👍",
  ...props,
  stepType: stepTypes.enum.reaction,
})
