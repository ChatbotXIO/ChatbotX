import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const appointmentSchedulingModes = z.enum([
  "bookFromCustomField",
  "checkAvailabilityFromCustomField",
  "book",
  "checkAvailability",
  "cancel",
])
export type AppointmentSchedulingMode = z.infer<
  typeof appointmentSchedulingModes
>

const appointmentSchedulingBaseFields = {
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.appointmentScheduling),
  calendarId: zodBigintAsString(),
  states: z.tuple([successStateSchema, errorStateSchema]),
}

export const appointmentSchedulingStepSchema = z.discriminatedUnion("mode", [
  z.object({
    ...appointmentSchedulingBaseFields,
    mode: z.literal(appointmentSchedulingModes.enum.bookFromCustomField),
    dateTimeFieldId: z.string().trim().min(1),
  }),
  z.object({
    ...appointmentSchedulingBaseFields,
    mode: z.literal(
      appointmentSchedulingModes.enum.checkAvailabilityFromCustomField,
    ),
    startDateFieldId: z.string().trim().min(1),
    endDateFieldId: z.string().trim().min(1),
    resultUsedByAI: z.boolean().default(false),
    outputCustomFieldId: z.string().trim().min(1),
  }),
  z.object({
    ...appointmentSchedulingBaseFields,
    mode: z.literal(appointmentSchedulingModes.enum.book),
    dateTimeFieldId: z.string().trim().min(1),
  }),
  z.object({
    ...appointmentSchedulingBaseFields,
    mode: z.literal(appointmentSchedulingModes.enum.cancel),
  }),
  z.object({
    ...appointmentSchedulingBaseFields,
    mode: z.literal(appointmentSchedulingModes.enum.checkAvailability),
    startDateFieldId: z.string().trim().min(1),
    endDateFieldId: z.string().trim().min(1),
  }),
])
export type AppointmentSchedulingStepSchema = z.infer<
  typeof appointmentSchedulingStepSchema
>

export const appointmentSchedulingStepDefaultFn =
  (): AppointmentSchedulingStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.appointmentScheduling,
    mode: appointmentSchedulingModes.enum.bookFromCustomField,
    calendarId: "",
    dateTimeFieldId: "",
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
