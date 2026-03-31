import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const optInEmailStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.optInEmail),
})

export type OptInEmailStepSchema = z.infer<typeof optInEmailStepSchema>

export const optInEmailStepDefaultFn = (): OptInEmailStepSchema => ({
  id: createId(),
  stepType: StepType.optInEmail,
})
