import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendVideoStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.sendVideo),
  mode: uploadModes,
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendVideo,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
