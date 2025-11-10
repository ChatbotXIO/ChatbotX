import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const removeContactTagStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.removeContactTag),
  tags: z.array(z.string().trim().min(1)).min(1),
})

export type RemoveContactTagStepSchema = z.infer<
  typeof removeContactTagStepSchema
>

export const removeContactTagStepDefaultFn =
  (): RemoveContactTagStepSchema => ({
    id: createId(),
    stepType: StepType.removeContactTag,
    tags: [],
  })
