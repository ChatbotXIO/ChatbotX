import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const openWebsiteStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.openWebsite),
  url: z.url(),
  browserSize: z.literal([40, 70, 100]),
})

export type OpenWebsiteStepSchema = z.infer<typeof openWebsiteStepSchema>

export const openWebsiteStepDefaultFn = (): OpenWebsiteStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.openWebsite,
  url: "",
  browserSize: 100,
})
