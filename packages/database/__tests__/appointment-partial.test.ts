import { describe, expect, test } from "vitest"
import { appointmentScheduleWindowConfigSchema } from "../src/partials/appointment"

describe("appointmentScheduleWindowConfigSchema", () => {
  test("allows same-day booking with zero minimum advance days", () => {
    const configs = [
      {
        scheduleWindowType: "rollingDays",
        rollingDays: 30,
        minAdvanceDays: 0,
      },
      {
        scheduleWindowType: "dateRange",
        startDate: "2026-08-09",
        endDate: "2026-08-31",
        minAdvanceDays: 0,
      },
      {
        scheduleWindowType: "specificDay",
        date: "2026-08-09",
        minAdvanceDays: 0,
      },
      {
        scheduleWindowType: "anyFutureDate",
        minAdvanceDays: 0,
      },
    ]

    for (const config of configs) {
      expect(
        appointmentScheduleWindowConfigSchema.safeParse(config).success,
      ).toBe(true)
    }
  })
})
