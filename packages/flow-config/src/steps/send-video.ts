import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendVideoStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.sendVideo),
  mode: uploadModes,
  url: z.url(),
  buttons: z.array(buttonStepSchema),
})

export type SendVideoStepSchema = z.infer<typeof sendVideoStepSchema>

export const sendVideoStepDefaultFn = (): SendVideoStepSchema => ({
  id: createId(),
  stepType: StepType.sendVideo,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
