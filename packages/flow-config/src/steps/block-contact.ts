import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const blockContactStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.blockContact),
})

export type BlockContactStepSchema = z.infer<typeof blockContactStepSchema>

export const blockContactStepDefaultFn = (
  props?: Partial<BlockContactStepSchema>,
): BlockContactStepSchema => ({
  id: createId(),
  stepType: StepType.blockContact,
  ...props,
})
