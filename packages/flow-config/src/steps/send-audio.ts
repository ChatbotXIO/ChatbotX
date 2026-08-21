import { createId, zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendAudioStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendAudio),
  mode: uploadModes,
  url: zodUrlWithVariables(),
  buttons: z.array(buttonStepSchema),
})

export type SendAudioStepSchema = z.infer<typeof sendAudioStepSchema>

export const sendAudioStepDefaultFn = (
  props?: Partial<SendAudioStepSchema>,
): SendAudioStepSchema => ({
  id: createId(),
  mode: uploadModes.enum.file,
  url: "",
  buttons: [],
  ...props,
  stepType: stepTypes.enum.sendAudio,
})
