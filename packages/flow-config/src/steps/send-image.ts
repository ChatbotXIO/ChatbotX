import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendImageStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendImage),
  mode: uploadModes,
  // Accepts a plain URL or a `{{customField}}` placeholder resolved at send
  // time by the worker's contact-variable interpolation.
  url: zodUrlWithVariables(),
  buttons: z.array(buttonStepSchema),
})

export type SendImageStepSchema = z.infer<typeof sendImageStepSchema>

export const sendImageStepDefaultFn = (): SendImageStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendImage,
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
})
