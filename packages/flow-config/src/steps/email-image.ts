import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { UploadMode } from "../types"
import { StepType } from "./step-action"

export const emailImageStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.emailImage),
  mode: z.enum(UploadMode),
  url: z.url(),
})

export type EmailImageStepSchema = z.infer<typeof emailImageStepSchema>

export const emailImageStepDefaultFn = (
  props: Partial<EmailImageStepSchema> = {},
): EmailImageStepSchema => ({
  url: "",
  ...props,
  id: createId(),
  stepType: StepType.emailImage,
  mode: UploadMode.file,
})
