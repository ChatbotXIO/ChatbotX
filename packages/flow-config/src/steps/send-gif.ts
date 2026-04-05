import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const sendGifStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.sendGif),
  url: z.url(),
})

export type SendGifStepSchema = z.infer<typeof sendGifStepSchema>

export const sendGifStepDefaultFn = (): SendGifStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendGif,
  url: "",
})
