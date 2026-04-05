import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { uploadModes } from "../types"
import { stepTypes } from "./step-action"

export const emailImageStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailImage),
  mode: uploadModes,
  url: z.url(),
})

export type EmailImageStepSchema = z.infer<typeof emailImageStepSchema>

export const emailImageStepDefaultFn = (
  props: Partial<EmailImageStepSchema> = {},
): EmailImageStepSchema => ({
  url: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailImage,
  mode: uploadModes.enum.file,
})
