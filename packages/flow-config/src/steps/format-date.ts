import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const FormatTimezone = {
  CONTACT: "CONTACT",
  ACCOUNT: "ACCOUNT",
} as const

export const formatDateStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.formatDate),
  inputCustomFieldId: z.cuid2(),
  format: z.string().trim().min(1),
  outputCustomFieldId: z.cuid2(),
  timezone: z.enum(FormatTimezone),
})
export type FormatDateStepSchema = z.infer<typeof formatDateStepSchema>

export const formatDateStepDefaultFn = (
  props?: Partial<FormatDateStepSchema>,
): FormatDateStepSchema => ({
  id: createId(),
  stepType: StepType.formatDate,
  inputCustomFieldId: "",
  format: "",
  outputCustomFieldId: "",
  timezone: FormatTimezone.CONTACT,
  ...props,
})
