import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const removeContactTagStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.removeContactTag),
  tags: z.array(z.string().trim().min(1)).min(1),
})

export type RemoveContactTagStepSchema = z.infer<
  typeof removeContactTagStepSchema
>

export const removeContactTagStepDefaultFn =
  (): RemoveContactTagStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.removeContactTag,
    tags: [],
  })
