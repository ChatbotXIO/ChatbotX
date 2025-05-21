import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const openWebsiteStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPEN_WEBSITE),
  url: z.string().url(),
})

export type OpenWebsiteStepSchema = z.infer<typeof openWebsiteStepSchema>

export const openWebsiteStepDefaultFn = (): OpenWebsiteStepSchema => ({
  id: createId(),
  stepType: StepType.OPEN_WEBSITE,
  url: "",
})
