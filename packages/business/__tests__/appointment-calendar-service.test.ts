import { afterEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getBusyIntervalsForAppointmentCalendar: vi.fn(),
}))

vi.mock("../src/appointment-external-calendar", () => ({
  appointmentExternalCalendarService: {
    getBusyIntervalsForAppointmentCalendar:
      mocks.getBusyIntervalsForAppointmentCalendar,
  },
}))

import {
  appointmentCalendarService,
  listZonedCalendarDays,
  mergeIntervals,
  overlaps,
  resolveWindowBounds,
  sliceIntervalIntoSlots,
} from "../src/appointment-calendar/service"

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("listZonedCalendarDays", () => {
  test("keeps the requested local date and weekday for western timezones", () => {
    const days = listZonedCalendarDays(
      new Date("2026-08-05T04:00:00.000Z"),
      new Date("2026-08-06T03:59:59.999Z"),
      "America/New_York",
    )

    expect(days).toEqual([{ date: "2026-08-05", weekday: 3 }])
  })

  test("returns every local day in the requested range", () => {
    const days = listZonedCalendarDays(
      new Date("2026-08-04T17:00:00.000Z"),
      new Date("2026-08-06T16:59:59.999Z"),
      "Asia/Ho_Chi_Minh",
    )

    expect(days).toEqual([
      { date: "2026-08-05", weekday: 3 },
      { date: "2026-08-06", weekday: 4 },
    ])
  })

  test("falls back to UTC for invalid timezones", () => {
    const days = listZonedCalendarDays(
      new Date("2026-08-05T00:00:00.000Z"),
      new Date("2026-08-05T23:59:59.999Z"),
      "not-a-timezone",
    )

    expect(days).toEqual([{ date: "2026-08-05", weekday: 3 }])
  })
})

describe("resolveWindowBounds", () => {
  test("applies minimum advance days for rolling windows", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"))

    const bounds = resolveWindowBounds(
      {
        scheduleWindowType: "rollingDays",
        rollingDays: 30,
        minAdvanceDays: 2,
      },
      "UTC",
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-20T00:00:00.000Z"),
    )

    expect(bounds?.start).toEqual(new Date("2026-08-11T00:00:00.000Z"))
  })

  test.each([
    {
      config: {
        scheduleWindowType: "dateRange",
        startDate: "2026-08-09",
        endDate: "2026-08-20",
        minAdvanceDays: 10,
      },
      expectedStart: new Date("2026-08-19T00:00:00.000Z"),
    },
    {
      config: {
        scheduleWindowType: "specificDay",
        date: "2026-08-09",
        minAdvanceDays: 10,
      },
      expectedStart: null,
    },
    {
      config: {
        scheduleWindowType: "anyFutureDate",
        minAdvanceDays: 10,
      },
      expectedStart: new Date("2026-08-19T00:00:00.000Z"),
    },
  ] as const)("applies minimum advance days for $config.scheduleWindowType windows", ({
    config,
    expectedStart,
  }) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"))

    const bounds = resolveWindowBounds(
      config,
      "UTC",
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-20T00:00:00.000Z"),
    )

    expect(bounds?.start ?? null).toEqual(expectedStart)
  })

  test("falls back to UTC when the calendar timezone is invalid", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"))

    const bounds = resolveWindowBounds(
      {
        scheduleWindowType: "specificDay",
        date: "2026-08-09",
        minAdvanceDays: 0,
      },
      "not-a-timezone",
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-10T00:00:00.000Z"),
    )

    expect(bounds).toEqual({
      start: new Date("2026-08-09T00:00:00.000Z"),
      end: new Date("2026-08-09T23:59:59.999Z"),
    })
  })
})

describe("mergeIntervals", () => {
  test("merges overlapping intervals into one", () => {
    const merged = mergeIntervals([
      { start: 540, end: 600 },
      { start: 570, end: 630 },
    ])
    expect(merged).toEqual([{ start: 540, end: 630 }])
  })

  test("merges duplicate intervals without adding capacity", () => {
    const merged = mergeIntervals([
      { start: 540, end: 600 },
      { start: 540, end: 600 },
    ])
    expect(merged).toEqual([{ start: 540, end: 600 }])
  })

  test("keeps disjoint intervals separate", () => {
    const merged = mergeIntervals([
      { start: 540, end: 600 },
      { start: 700, end: 760 },
    ])
    expect(merged).toEqual([
      { start: 540, end: 600 },
      { start: 700, end: 760 },
    ])
  })

  test("merges touching intervals (adjacent boundaries)", () => {
    const merged = mergeIntervals([
      { start: 540, end: 600 },
      { start: 600, end: 660 },
    ])
    expect(merged).toEqual([{ start: 540, end: 660 }])
  })

  test("handles unsorted input", () => {
    const merged = mergeIntervals([
      { start: 700, end: 760 },
      { start: 540, end: 600 },
    ])
    expect(merged).toEqual([
      { start: 540, end: 600 },
      { start: 700, end: 760 },
    ])
  })

  test("returns empty array for no intervals", () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe("sliceIntervalIntoSlots", () => {
  test("slices a merged interval into fixed-length slots with no buffer", () => {
    const slots = sliceIntervalIntoSlots({ start: 540, end: 600 }, 30, 0)
    expect(slots).toEqual([
      { startMinute: 540, endMinute: 570 },
      { startMinute: 570, endMinute: 600 },
    ])
  })

  test("steps by duration + buffer between slots", () => {
    const slots = sliceIntervalIntoSlots({ start: 540, end: 630 }, 30, 15)
    expect(slots).toEqual([
      { startMinute: 540, endMinute: 570 },
      { startMinute: 585, endMinute: 615 },
    ])
  })

  test("drops a trailing slot that would exceed the interval end", () => {
    const slots = sliceIntervalIntoSlots({ start: 540, end: 595 }, 30, 0)
    expect(slots).toEqual([{ startMinute: 540, endMinute: 570 }])
  })

  test("returns no slots when duration exceeds the interval", () => {
    const slots = sliceIntervalIntoSlots({ start: 540, end: 560 }, 30, 0)
    expect(slots).toEqual([])
  })
})

describe("overlaps", () => {
  test("does not block slots that only touch busy interval boundaries", () => {
    const busy = [{ start: 1000, end: 2000 }]

    expect(overlaps(0, 1000, busy)).toBe(false)
    expect(overlaps(2000, 3000, busy)).toBe(false)
  })

  test("blocks slots with any real intersection", () => {
    const busy = [{ start: 1000, end: 2000 }]

    expect(overlaps(999, 1001, busy)).toBe(true)
    expect(overlaps(1500, 2500, busy)).toBe(true)
  })
})

describe("appointmentCalendarService.generateAvailableSlots", () => {
  test("filters slots that overlap external busy intervals", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"))

    const tx = {
      query: {
        appointmentCalendarModel: {
          findFirst: vi.fn().mockResolvedValue({
            id: "calendar-1",
            workspaceId: "workspace-1",
            active: true,
            timezone: "UTC",
            scheduleWindowType: "specificDay",
            scheduleWindowConfig: {
              date: "2026-08-12",
              minAdvanceDays: 0,
            },
            durationMinutes: 30,
            bufferAfterMinutes: 0,
            maxAppointmentsPerUser: null,
            dailyLimitEnabled: false,
            maxPerDay: null,
            allowGroupMeeting: false,
            maxPerSlot: null,
          }),
        },
        appointmentCalendarAvailabilityModel: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { weekday: 3, startMinute: 540, endMinute: 600 },
            ]),
        },
        appointmentModel: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      $count: vi.fn(),
    }

    const slots = await appointmentCalendarService.generateAvailableSlots({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      startDate: new Date("2026-08-12T00:00:00.000Z"),
      endDate: new Date("2026-08-12T23:59:59.999Z"),
      externalBusyIntervals: [
        {
          start: new Date("2026-08-12T09:30:00.000Z").getTime(),
          end: new Date("2026-08-12T10:00:00.000Z").getTime(),
        },
      ],
      tx: tx as never,
    })

    expect(slots).toEqual([
      {
        startAt: new Date("2026-08-12T09:00:00.000Z"),
        endAt: new Date("2026-08-12T09:30:00.000Z"),
      },
    ])
  })

  test("returns empty listing results when external busy lookup fails", async () => {
    const prepareSpy = vi
      .spyOn(appointmentCalendarService, "prepareAvailabilityContext")
      .mockResolvedValue({
        calendarFingerprint: {
          externalConnectionId: "integration-1",
          timezone: "UTC",
          updatedAt: 1,
        },
        externalBusyIntervals: [],
        listingEmpty: true,
      })
    const generateSpy = vi.spyOn(
      appointmentCalendarService,
      "generateAvailableSlots",
    )

    await expect(
      appointmentCalendarService.resolveAvailableSlotsForListing({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        startDate: new Date("2026-08-12T00:00:00.000Z"),
        endDate: new Date("2026-08-12T23:59:59.999Z"),
      }),
    ).resolves.toEqual([])

    expect(prepareSpy).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      startDate: new Date("2026-08-12T00:00:00.000Z"),
      endDate: new Date("2026-08-12T23:59:59.999Z"),
      failurePolicy: "empty",
    })
    expect(generateSpy).not.toHaveBeenCalled()
  })
})

describe("appointmentCalendarService.hasExternalBusyConflictForSlot", () => {
  test("returns false without an external connection", async () => {
    await expect(
      appointmentCalendarService.hasExternalBusyConflictForSlot({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        externalConnectionId: null,
        startAt: new Date("2026-08-12T09:00:00.000Z"),
        endAt: new Date("2026-08-12T09:30:00.000Z"),
      }),
    ).resolves.toBe(false)

    expect(mocks.getBusyIntervalsForAppointmentCalendar).not.toHaveBeenCalled()
  })

  test("returns true when external busy intervals overlap the requested slot", async () => {
    mocks.getBusyIntervalsForAppointmentCalendar.mockResolvedValue([
      {
        start: new Date("2026-08-12T09:15:00.000Z").getTime(),
        end: new Date("2026-08-12T09:45:00.000Z").getTime(),
      },
    ])

    await expect(
      appointmentCalendarService.hasExternalBusyConflictForSlot({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        externalConnectionId: "integration-1",
        startAt: new Date("2026-08-12T09:00:00.000Z"),
        endAt: new Date("2026-08-12T09:30:00.000Z"),
      }),
    ).resolves.toBe(true)

    expect(mocks.getBusyIntervalsForAppointmentCalendar).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      timeMin: "2026-08-12T09:00:00.000Z",
      timeMax: "2026-08-12T09:30:00.000Z",
      timeoutMs: 5000,
    })
  })

  test("fails closed when external busy revalidation fails", async () => {
    mocks.getBusyIntervalsForAppointmentCalendar.mockRejectedValue(
      new Error("provider timeout"),
    )

    await expect(
      appointmentCalendarService.hasExternalBusyConflictForSlot({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        externalConnectionId: "integration-1",
        startAt: new Date("2026-08-12T09:00:00.000Z"),
        endAt: new Date("2026-08-12T09:30:00.000Z"),
      }),
    ).resolves.toBe(true)
  })
})
