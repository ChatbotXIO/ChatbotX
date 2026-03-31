import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const FormatTimezone = {
  contact: "contact",
  chatbot: "chatbot",
} as const

export const formatDateStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.formatDate),
  inputCfId: z.bigint(),
  format: z.string().trim().min(1),
  outputCfId: z.bigint(),
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
