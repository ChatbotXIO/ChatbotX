import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const openWebsiteStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OpenWebsite),
  url: z.string().url(),
  browserSize: z.union([z.literal(40), z.literal(70), z.literal(100)]),
})

export type OpenWebsiteStepSchema = z.infer<typeof openWebsiteStepSchema>

export const openWebsiteStepDefaultFn = (): OpenWebsiteStepSchema => ({
  id: createId(),
  stepType: StepType.OpenWebsite,
  url: "",
  browserSize: 100,
})
