import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

export const sendGifStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendGif),
  url: z.url(),
})

export type SendGifStepSchema = z.infer<typeof sendGifStepSchema>

export const sendGifStepDefaultFn = (): SendGifStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendGif,
  url: "",
})
