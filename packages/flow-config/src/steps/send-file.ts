import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendFileStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.sendFile),
  mode: uploadModes,
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendFileStepSchema = z.infer<typeof sendFileStepSchema>

export const sendFileStepDefaultFn = (): SendFileStepSchema => ({
  id: createId(),
  stepType: StepType.sendFile,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
