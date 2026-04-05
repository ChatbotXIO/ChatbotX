import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const blockContactStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.blockContact),
})

export type BlockContactStepSchema = z.infer<typeof blockContactStepSchema>

export const blockContactStepDefaultFn = (
  props?: Partial<BlockContactStepSchema>,
): BlockContactStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.blockContact,
  ...props,
})
