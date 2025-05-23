import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const blockContactStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.BLOCK_CONTACT),
})

export type BlockContactStepSchema = z.infer<typeof blockContactStepSchema>

export const blockContactStepDefaultFn = (): BlockContactStepSchema => ({
  id: createId(),
  actionType: StepType.BLOCK_CONTACT,
})
