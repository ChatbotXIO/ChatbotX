import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { UploadMode } from "../types"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendVideoStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendVideo),
  mode: z.enum(UploadMode),
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: StepType.sendVideo,
  mode: UploadMode.file,
  url: "",
  buttons: [],
})
