import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const followConversationStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.followConversation)
    .describe('Step type discriminator: "followConversation".'),
})

export type FollowConversationStepSchema = z.infer<
  typeof followConversationStepSchema
>

export const followConversationStepDefaultFn =
  (): FollowConversationStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.followConversation,
  })
