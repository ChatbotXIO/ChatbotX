import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findBy: vi.fn(),
  create: vi.fn(),
  listNamesWithPrefix: vi.fn(),
  update: vi.fn(),
  replaceAvailability: vi.fn(),
  replaceReminders: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  getGoogleConnectionForProviderCall: vi.fn(),
  listPendingJobIdsForFutureCalendar: vi.fn(),
  assertAllExist: vi.fn(),
  rescheduleFutureForCalendar: vi.fn(),
}))

// Runs through the mocked `db.transaction` and records the initial lock keys.
const { lockOptionsSpy } = vi.hoisted(() => ({ lockOptionsSpy: vi.fn() }))
vi.mock("../src/template/template-resource-locks", async () => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    withTemplateLockedTransaction: (
      run: (tx: unknown) => unknown,
      options?: unknown,
    ) => {
      lockOptionsSpy(options)
      return db.transaction(run as never)
    },
  }
})

// The template lock guard has its own suite; these tests cover the service.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: vi.fn(),
  }),
  changedKeysOf: vi.fn(() => []),
  changedStoredContentKeys: vi.fn(() => []),
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
    getForEdit: mocks.findBy,
    create: mocks.create,
    listNamesWithPrefix: mocks.listNamesWithPrefix,
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

  test("locks the calendar and every flow it points at before reading the stored row", async () => {
    await appointmentCalendarService.update({
      ...baseUpdateInput,
      confirmationFlowId: "flow-1",
      cancellationFlowId: "flow-2",
      reminders: [{ flowId: "flow-3", timingValue: 10, timingUnit: "minutes" }],
    })

    expect(lockOptionsSpy).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      initialKeys: [
        { kind: "calendar", resourceId: "calendar-1" },
        { kind: "flow", resourceId: "flow-1" },
        { kind: "flow", resourceId: "flow-2" },
        { kind: "flow", resourceId: "flow-3" },
      ],
    })
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

describe("appointmentCalendarService.duplicate", () => {
  const source = {
    id: "calendar-1",
    name: "Sales calls",
    timezone: "UTC",
    locationType: "online",
    availability: [],
    reminders: [],
    scheduleWindowConfig: {},
  }
  const client: { transaction: (fn: (tx: unknown) => unknown) => unknown } = {
    transaction: (fn) => fn(client),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(client),
    )
    mocks.findBy.mockResolvedValue(source)
    mocks.listNamesWithPrefix.mockResolvedValue([])
    mocks.create.mockImplementation(async (values: { name: string }) => ({
      id: "calendar-2",
      ...values,
    }))
    mocks.update.mockResolvedValue({ id: "calendar-2" })
    mocks.isUniqueViolationError.mockReturnValue(false)
  })

  const createdNames = () =>
    mocks.create.mock.calls.map(([values]) => (values as { name: string }).name)

  test("names the first copy `<name> - Copy` and leaves it inactive", async () => {
    await expect(
      appointmentCalendarService.duplicate({
        workspaceId: "workspace-1",
        id: "calendar-1",
      }),
    ).resolves.toBe("calendar-2")

    expect(createdNames()).toEqual(["Sales calls - Copy"])
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
      expect.anything(),
    )
  })

  test("a second copy takes the next free name instead of failing on the unique index", async () => {
    mocks.listNamesWithPrefix.mockResolvedValue(["Sales calls - Copy"])

    await appointmentCalendarService.duplicate({
      workspaceId: "workspace-1",
      id: "calendar-1",
    })

    expect(createdNames()).toEqual(["Sales calls - Copy 2"])
  })

  test("tries the next name when a concurrent copy took the free one", async () => {
    mocks.create.mockRejectedValueOnce(new Error("duplicate"))
    mocks.isUniqueViolationError.mockReturnValueOnce(true)

    await appointmentCalendarService.duplicate({
      workspaceId: "workspace-1",
      id: "calendar-1",
    })

    expect(createdNames()).toEqual([
      "Sales calls - Copy",
      "Sales calls - Copy 2",
    ])
  })

  test("reports nameAlreadyExists when every candidate is taken", async () => {
    mocks.create.mockRejectedValue(new Error("duplicate"))
    mocks.isUniqueViolationError.mockReturnValue(true)

    await expect(
      appointmentCalendarService.duplicate({
        workspaceId: "workspace-1",
        id: "calendar-1",
      }),
    ).rejects.toMatchObject({ code: "nameAlreadyExists" })
  })
})

describe("appointmentCalendarService.rename template lock", () => {
  const client = { marker: "tx" }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(client),
    )
    mocks.update.mockResolvedValue({ id: "calendar-1" })
    mocks.isUniqueViolationError.mockReturnValue(false)
  })

  test("guards first inside the locked transaction and writes on it", async () => {
    const { assertResourceEditable } = await import(
      "../src/template/installed-resource.service"
    )

    await appointmentCalendarService.rename({
      workspaceId: "workspace-1",
      id: "calendar-1",
      name: " New name ",
    })

    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "calendar",
        resourceIds: ["calendar-1"],
        changedKeys: ["name"],
        tx: client,
      }),
    )
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.update.mock.invocationCallOrder[0] as number)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New name" }),
      client,
    )
  })

  test("a blocked rename writes nothing", async () => {
    const { assertResourceEditable } = await import(
      "../src/template/installed-resource.service"
    )
    vi.mocked(assertResourceEditable).mockRejectedValueOnce(new Error("locked"))

    await expect(
      appointmentCalendarService.rename({
        workspaceId: "workspace-1",
        id: "calendar-1",
        name: "New name",
      }),
    ).rejects.toThrow("locked")
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
