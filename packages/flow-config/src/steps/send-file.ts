import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendFileStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.sendFile),
  mode: uploadModes,
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendFileStepSchema = z.infer<typeof sendFileStepSchema>

export const sendFileStepDefaultFn = (): SendFileStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendFile,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
