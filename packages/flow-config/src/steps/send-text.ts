import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendTextStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendText),
  message: z.string().trim().min(1).max(1000),
  buttons: z.array(buttonStepSchema),
})

export type SendTextStepSchema = z.infer<typeof sendTextStepSchema>

export const sendTextStepDefaultFn = (
  props: Partial<SendTextStepSchema> = {},
): SendTextStepSchema => ({
  message: "",
  buttons: [],
  ...props,
  id: createId(),
  stepType: StepType.sendText,
})
