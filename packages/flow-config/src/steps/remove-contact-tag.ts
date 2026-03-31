import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const removeContactTagStepSchema = z.object({
  id: z.bigint(),
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
