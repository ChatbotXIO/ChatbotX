import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const FormatTimezone = {
  contact: "contact",
  chatbot: "chatbot",
} as const

export const formatDateStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.formatDate),
  inputCfId: z.cuid2(),
  format: z.string().trim().min(1),
  outputCfId: z.cuid2(),
  timezone: z.enum(FormatTimezone),
})
export type FormatDateStepSchema = z.infer<typeof formatDateStepSchema>

export const formatDateStepDefaultFn = (
  props?: Partial<FormatDateStepSchema>,
): FormatDateStepSchema => ({
  id: createId(),
  stepType: StepType.formatDate,
  inputCfId: "",
  format: "",
  outputCfId: "",
  timezone: FormatTimezone.contact,
  ...props,
})
