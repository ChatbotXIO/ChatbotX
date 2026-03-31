import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const addContactTagStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.addContactTag),
  tags: z.array(z.string().trim().min(1)).min(1),
})

export type AddContactTagStepSchema = z.infer<typeof addContactTagStepSchema>

export const addContactTagStepDefaultFn = (
  props?: Partial<AddContactTagStepSchema>,
): AddContactTagStepSchema => ({
  id: createId(),
  stepType: StepType.addContactTag,
  tags: [],
  ...props,
})
