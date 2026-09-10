import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findBy: vi.fn(),
  update: vi.fn(),
  replaceAvailability: vi.fn(),
  replaceReminders: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  getGoogleConnectionForProviderCall: vi.fn(),
  listPendingJobIdsForFutureCalendar: vi.fn(),
  assertAllExist: vi.fn(),
  rescheduleFutureForCalendar: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  appointmentCalendarRepository: {
    findBy: mocks.findBy,
    update: mocks.update,
    replaceAvailability: mocks.replaceAvailability,
    replaceReminders: mocks.replaceReminders,
  },
  appointmentReminderDispatchRepository: {
    listPendingJobIdsForFutureCalendar:
      mocks.listPendingJobIdsForFutureCalendar,
  },
}))

vi.mock("../src/appointment-external-calendar", () => ({
  appointmentExternalCalendarService: {
    getGoogleConnectionForProviderCall:
      mocks.getGoogleConnectionForProviderCall,
  },
}))

vi.mock("../src/appointment-reminder", () => ({
  appointmentReminderService: {
    rescheduleFutureForCalendar: mocks.rescheduleFutureForCalendar,
  },
}))

vi.mock("../src/flow/service", () => ({
  flowService: {
    assertAllExist: mocks.assertAllExist,
  },
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    invalidateList: vi.fn(),
  },
}))

const { appointmentCalendarService } = await import(
  "../src/appointment-calendar/service"
)

const baseUpdateInput = {
  workspaceId: "workspace-1",
  id: "calendar-1",
  name: "Sales calls",
  active: true,
  timezone: "UTC",
  durationMinutes: 30,
  dailyLimitEnabled: false,
  allowGroupMeeting: false,
  scheduleWindowType: "rollingDays" as const,
  scheduleWindowConfig: {
    scheduleWindowType: "rollingDays" as const,
    rollingDays: 14,
  },
  availability: [],
  reminders: [],
}

describe("appointmentCalendarService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.findBy.mockResolvedValue({
      id: "calendar-1",
      workspaceId: "workspace-1",
    })
    mocks.update.mockResolvedValue({ id: "calendar-1" })
    mocks.replaceAvailability.mockResolvedValue(undefined)
    mocks.replaceReminders.mockResolvedValue([])
    mocks.listPendingJobIdsForFutureCalendar.mockResolvedValue([])
    mocks.assertAllExist.mockResolvedValue(undefined)
    mocks.rescheduleFutureForCalendar.mockResolvedValue(undefined)
  })

  test("skips the flow ownership check when no flow id is referenced", async () => {
    await appointmentCalendarService.update(baseUpdateInput)

    expect(mocks.assertAllExist).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalled()
  })

  test("validates confirmationFlowId, cancellationFlowId, and reminder flowIds belong to the workspace", async () => {
    await appointmentCalendarService.update({
      ...baseUpdateInput,
      confirmationFlowId: "flow-1",
      cancellationFlowId: "flow-2",
      reminders: [
        { flowId: "flow-3", timingValue: 10, timingUnit: "minutes" },
        { flowId: "flow-1", timingValue: 1, timingUnit: "hours" },
      ],
    })

    expect(mocks.assertAllExist).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        flowIds: expect.arrayContaining(["flow-1", "flow-2", "flow-3"]),
      },
      "tx",
    )
    // de-duplicated: flow-1 appears twice (confirmationFlowId + a reminder)
    const [{ flowIds }] = mocks.assertAllExist.mock.calls[0] as [
      { flowIds: string[] },
      unknown,
    ]
    expect(flowIds).toHaveLength(3)
  })

  test("rejects a foreign-workspace flowId before writing the calendar row", async () => {
    mocks.assertAllExist.mockRejectedValueOnce(
      new Error("Flow does not exists."),
    )

    await expect(
      appointmentCalendarService.update({
        ...baseUpdateInput,
        confirmationFlowId: "flow-from-workspace-2",
      }),
    ).rejects.toThrow("Flow does not exists.")

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.replaceAvailability).not.toHaveBeenCalled()
    expect(mocks.replaceReminders).not.toHaveBeenCalled()
  })

  test("rejects a foreign-workspace reminder flowId before writing the calendar row", async () => {
    mocks.assertAllExist.mockRejectedValueOnce(
      new Error("Flow does not exists."),
    )

    await expect(
      appointmentCalendarService.update({
        ...baseUpdateInput,
        reminders: [
          {
            flowId: "flow-from-workspace-2",
            timingValue: 10,
            timingUnit: "minutes",
          },
        ],
      }),
    ).rejects.toThrow("Flow does not exists.")

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.replaceReminders).not.toHaveBeenCalled()
  })
})
