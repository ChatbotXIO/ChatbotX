import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const removeContactTagStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.REMOVE_CONTACT_TAG),
  tags: z.array(z.string().trim().min(1)).min(1),
})

export type RemoveContactTagStepSchema = z.infer<
  typeof removeContactTagStepSchema
>

export const removeContactTagStepDefaultFn =
  (): RemoveContactTagStepSchema => ({
    id: createId(),
    stepType: StepType.REMOVE_CONTACT_TAG,
    tags: [],
  })
