// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }))
  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insertInto = vi.fn(() => ({ values: insertValues }))
  const findMany = vi.fn()

  return {
    createId: vi.fn(() => "new-reminder-id"),
    deleteFrom,
    deleteWhere,
    findMany,
    inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
    insertInto,
    insertReturning,
    insertValues,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  db: {},
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  ilike: vi.fn(),
  inArray: mocks.inArray,
  isNull: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  appointmentCalendarAvailabilityModel: {},
  appointmentCalendarModel: {},
  appointmentCalendarReminderModel: {
    id: "id",
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
  parseOrderBy: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

const { appointmentCalendarRepository } = await import(
  "../src/repositories/appointment-calendar/repository"
)

describe("appointmentCalendarRepository.replaceReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([
      {
        id: "keep-reminder-id",
        calendarId: "calendar-1",
        flowId: "flow-1",
        timingValue: 1,
        timingUnit: "hours",
      },
      {
        id: "delete-reminder-id",
        calendarId: "calendar-1",
        flowId: "flow-2",
        timingValue: 2,
        timingUnit: "days",
      },
    ])
    mocks.insertReturning.mockResolvedValue([
      {
        id: "new-reminder-id",
        calendarId: "calendar-1",
        flowId: "flow-3",
        timingValue: 30,
        timingUnit: "minutes",
      },
    ])
  })

  test("keeps unchanged reminders so dispatch history is not cascaded", async () => {
    const tx = {
      delete: mocks.deleteFrom,
      insert: mocks.insertInto,
      query: {
        appointmentCalendarReminderModel: {
          findMany: mocks.findMany,
        },
      },
    }

    const result = await appointmentCalendarRepository.replaceReminders(
      {
        calendarId: "calendar-1",
        reminders: [
          {
            flowId: "flow-1",
            timingValue: 1,
            timingUnit: "hours",
          },
          {
            flowId: "flow-3",
            timingValue: 30,
            timingUnit: "minutes",
          },
        ],
      },
      tx as never,
    )

    expect(mocks.deleteWhere).toHaveBeenCalledWith({
      field: "id",
      values: ["delete-reminder-id"],
    })
    expect(mocks.insertValues).toHaveBeenCalledWith([
      {
        id: "new-reminder-id",
        calendarId: "calendar-1",
        flowId: "flow-3",
        timingValue: 30,
        timingUnit: "minutes",
      },
    ])
    expect(result).toEqual([
      expect.objectContaining({ id: "keep-reminder-id" }),
      expect.objectContaining({ id: "new-reminder-id" }),
    ])
  })
})
