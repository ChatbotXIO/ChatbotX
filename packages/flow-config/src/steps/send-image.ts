import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { UploadMode } from "../types"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendImageStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendImage),
  mode: z.enum(UploadMode),
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendImageStepSchema = z.infer<typeof sendImageStepSchema>

export const sendImageStepDefaultFn = (): SendImageStepSchema => ({
  id: createId(),
  stepType: StepType.sendImage,
  mode: UploadMode.file,
  url: "",
  buttons: [],
})
