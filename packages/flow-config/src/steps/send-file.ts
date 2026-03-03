import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { UploadMode } from "../types"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendFileStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendFile),
  mode: z.enum(UploadMode),
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendFileStepSchema = z.infer<typeof sendFileStepSchema>

export const sendFileStepDefaultFn = (): SendFileStepSchema => ({
  id: createId(),
  stepType: StepType.sendFile,
  mode: "file",
  url: "",
  buttons: [],
})
