import {
  createId,
  zodBigintAsString,
  zodUrlWithVariables,
} from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const openWebsiteStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.openWebsite),
  // The link may be a plain URL or contain `{{variables}}` (e.g. a booking
  // link) that resolve to a URL at runtime, so it is not validated as a strict
  // URL when it embeds a variable.
  url: zodUrlWithVariables(),
  browserSize: z.literal([40, 70, 100]),
})

export type OpenWebsiteStepSchema = z.infer<typeof openWebsiteStepSchema>

export const openWebsiteStepDefaultFn = (): OpenWebsiteStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.openWebsite,
  url: "",
  browserSize: 100,
})
