import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const FormatTimezone = {
  contact: "contact",
  workspace: "workspace",
} as const

export const formatDateStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.formatDate),
  inputCfId: zodBigintAsString(),
  format: z.string().trim().min(1),
  outputCfId: zodBigintAsString(),
  timezone: z.enum(FormatTimezone),
})
export type FormatDateStepSchema = z.infer<typeof formatDateStepSchema>

export const formatDateStepDefaultFn = (
  props?: Partial<FormatDateStepSchema>,
): FormatDateStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.formatDate,
  inputCfId: "",
  format: "",
  outputCfId: "",
  timezone: FormatTimezone.contact,
  ...props,
})
