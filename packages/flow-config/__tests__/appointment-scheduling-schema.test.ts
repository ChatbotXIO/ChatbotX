import { describe, expect, test } from "vitest"
import { appointmentSchedulingStepSchema, metadataSchema } from "../src"

const baseStep = {
  id: "step-1",
  stepType: "appointmentScheduling",
  mode: "checkAvailability",
  calendarId: "calendar-1",
  startDateFieldId: "start-field",
  endDateFieldId: "end-field",
  states: [
    { id: "1", stateType: "success" },
    { id: "2", stateType: "error" },
  ],
}

describe("appointment scheduling schemas", () => {
  test("checkAvailability does not require resultUsedByAI or outputCustomFieldId", () => {
    expect(appointmentSchedulingStepSchema.safeParse(baseStep).success).toBe(
      true,
    )
  })

  test("bookFromCustomField requires dateTimeFieldId", () => {
    const step = {
      id: "step-1",
      stepType: "appointmentScheduling",
      mode: "bookFromCustomField",
      calendarId: "calendar-1",
      states: [
        { id: "1", stateType: "success" },
        { id: "2", stateType: "error" },
      ],
    }

    expect(appointmentSchedulingStepSchema.safeParse(step).success).toBe(false)
    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...step,
        dateTimeFieldId: "date-field",
      }).success,
    ).toBe(true)
  })

  test("checkAvailabilityFromCustomField requires outputCustomFieldId regardless of resultUsedByAI", () => {
    const step = {
      ...baseStep,
      mode: "checkAvailabilityFromCustomField",
    }

    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...step,
        resultUsedByAI: false,
      }).success,
    ).toBe(false)
    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...step,
        resultUsedByAI: false,
        outputCustomFieldId: "output-field",
      }).success,
    ).toBe(true)
  })

  test("parses appointment availability range metadata", () => {
    expect(
      metadataSchema.safeParse({
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        contactInboxId: "contact-inbox-1",
        startDate: "2026-08-10T09:00:00.000",
        endDate: "2026-08-12T17:00:00.000",
      }).success,
    ).toBe(true)

    expect(
      metadataSchema.safeParse({
        type: "appointmentAvailabilityRangeSkipped",
        stepId: "step-1",
      }).success,
    ).toBe(true)
  })
})
