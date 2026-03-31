import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const sendGifStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.sendGif),
  url: z.url(),
})

export type SendGifStepSchema = z.infer<typeof sendGifStepSchema>

export const sendGifStepDefaultFn = (): SendGifStepSchema => ({
  id: createId(),
  stepType: StepType.sendGif,
  url: "",
})
