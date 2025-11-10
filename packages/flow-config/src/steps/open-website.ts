import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const openWebsiteStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.openWebsite),
  url: z.url(),
  browserSize: z.literal([40, 70, 100]),
})

export type OpenWebsiteStepSchema = z.infer<typeof openWebsiteStepSchema>

export const openWebsiteStepDefaultFn = (): OpenWebsiteStepSchema => ({
  id: createId(),
  stepType: StepType.openWebsite,
  url: "",
  browserSize: 100,
})
