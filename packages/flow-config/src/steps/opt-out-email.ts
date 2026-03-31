import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const optOutEmailStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.optOutEmail),
})

export type OptOutEmailStepSchema = z.infer<typeof optOutEmailStepSchema>

export const optOutEmailStepDefaultFn = (): OptOutEmailStepSchema => ({
  id: createId(),
  stepType: StepType.optOutEmail,
})
