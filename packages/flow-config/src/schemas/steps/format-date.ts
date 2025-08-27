import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const FormatTimezone = {
  CONTACT: "CONTACT",
  ACCOUNT: "ACCOUNT",
} as const

export const formatDateStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.FORMAT_DATE),
  inputCustomFieldId: z.string().cuid2(),
  format: z.string().trim().min(1),
  outputCustomFieldId: z.string().cuid2(),
  timezone: z.nativeEnum(FormatTimezone),
})
export type FormatDateStepSchema = z.infer<typeof formatDateStepSchema>

export const formatDateStepDefaultFn = (): FormatDateStepSchema => ({
  id: createId(),
  stepType: StepType.FORMAT_DATE,
  inputCustomFieldId: "",
  format: "",
  outputCustomFieldId: "",
  timezone: FormatTimezone.CONTACT,
})
