import { UploadMode } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const sendGifStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.SEND_GIF),
  mode: z.enum(UploadMode),
  url: z.string().trim().url(),
})

export type SendGifStepSchema = z.infer<typeof sendGifStepSchema>

export const sendGifStepDefaultFn = (): SendGifStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_GIF,
  mode: "file",
  url: "",
})
