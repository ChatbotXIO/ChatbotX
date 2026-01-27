import { UploadMode } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailImageStepSchema = z.object({
  id: z.cuid2(),
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
