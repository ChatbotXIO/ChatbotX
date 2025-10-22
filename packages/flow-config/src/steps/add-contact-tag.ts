import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const addContactTagStepSchema = z.object({
  id: z.cuid2(),
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
