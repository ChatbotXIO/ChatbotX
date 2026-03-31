import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const deleteContactStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.deleteContact),
})

export type DeleteContactStepSchema = z.infer<typeof deleteContactStepSchema>

export const deleteContactStepDefaultFn = (
  props?: Partial<DeleteContactStepSchema>,
): DeleteContactStepSchema => ({
  id: createId(),
  stepType: StepType.deleteContact,
  ...props,
})
