import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { type ButtonStepSchema, buttonStepSchema } from "../button/schema"

export const sendTextStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.enum([StepType.SendText]),
  message: z.string().trim().min(1).max(1000),
  buttons: z.array(buttonStepSchema),
})

export type SendTextStepSchema = z.infer<typeof sendTextStepSchema>

export const sendTextStepDefaultFn = (
  message = "",
  buttons: ButtonStepSchema[] = [],
): SendTextStepSchema => ({
  id: createId(),
  stepType: StepType.SendText,
  message,
  buttons,
})
