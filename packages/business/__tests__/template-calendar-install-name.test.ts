// @vitest-environment node

import { DrizzleQueryError } from "drizzle-orm/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  replaceAvailability: vi.fn(),
  replaceReminders: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appointmentCalendarRepository: {
    create: mocks.create,
    update: mocks.update,
    replaceAvailability: mocks.replaceAvailability,
    replaceReminders: mocks.replaceReminders,
  },
}))

const { calendarsAdapter } = await import("../src/template/adapters/calendars")

const CONSTRAINT = "AppointmentCalendar_workspaceId_name_key"

const entry = {
  sourceId: "cal-src",
  name: "Booking",
  description: null,
  timezone: "UTC",
  durationMinutes: 30,
  bufferAfterMinutes: 0,
  locationType: "onlineMeeting",
  locationDetail: null,
  scheduleWindowType: "rolling",
  scheduleWindowConfig: {},
  maxAppointmentsPerUser: null,
  dailyLimitEnabled: false,
  maxPerDay: null,
  allowGroupMeeting: false,
  maxPerSlot: null,
  confirmationMessage: null,
  confirmationFlowId: null,
  cancellationFlowId: null,
  externalConnectionId: null,
  availability: [],
  reminders: [],
}

// A savepoint per attempt: a refused insert never poisons the next one.
const buildContext = (existingNames: string[]) => {
  const tx = {
    transaction: (run: (inner: unknown) => unknown) => run(tx),
    query: {
      appointmentCalendarModel: {
        findMany: vi.fn(async () => existingNames.map((name) => ({ name }))),
      },
    },
  }
  return {
    tx: tx as never,
    workspaceId: "ws-1",
    installationId: "inst-1",
    idMaps: {} as Record<string, Map<string, string>>,
    track: vi.fn(),
    warn: vi.fn(),
  }
}

describe("installing a calendar whose name the target already uses", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Copied kinds are never reused (P1): the install takes the copy name
  // instead of failing as a whole on the unique index.
  test("installs it under the copy name and maps the source to it", async () => {
    const taken = new Set(["Booking"])
    mocks.create.mockImplementation((input: { name: string }) =>
      taken.has(input.name)
        ? Promise.reject(
            new DrizzleQueryError("insert", [], {
              code: "23505",
              constraint: CONSTRAINT,
            } as never),
          )
        : Promise.resolve({ id: "cal-new", name: input.name }),
    )
    const ctx = buildContext(["Booking"])

    await calendarsAdapter.insert(ctx as never, [entry] as never)

    const names = mocks.create.mock.calls.map(([input]) => input.name)
    expect(names[0]).toBe("Booking")
    expect(names.at(-1)).not.toBe("Booking")
    expect(names.at(-1)?.startsWith("Booking")).toBe(true)
    expect(ctx.idMaps.calendar?.get("cal-src")).toBe("cal-new")
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "calendar",
        resourceId: "cal-new",
      }),
    )
  })

  test("a different unique violation still fails the install", async () => {
    mocks.create.mockRejectedValue(
      new DrizzleQueryError("insert", [], {
        code: "23505",
        constraint: "AppointmentCalendar_publicLinkSlug_key",
      } as never),
    )

    await expect(
      calendarsAdapter.insert(buildContext([]) as never, [entry] as never),
    ).rejects.toBeInstanceOf(DrizzleQueryError)
  })
})

describe("a calendar's deferred flow references", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ id: "cal-new", name: "Booking" })
  })

  test("resolved flows are written once flows exist; unresolved ones warn under the source calendar id", async () => {
    const ctx = buildContext([])
    const patches = await calendarsAdapter.insert(
      ctx as never,
      [
        {
          ...entry,
          confirmationFlowId: "src-confirm",
          cancellationFlowId: "src-gone",
          reminders: [
            { flowId: "src-reminder", timingValue: 1, timingUnit: "hours" },
            { flowId: "src-missing", timingValue: 2, timingUnit: "hours" },
          ],
        },
      ] as never,
    )
    mocks.update.mockClear()
    ctx.idMaps.flow = new Map([
      ["src-confirm", "tgt-confirm"],
      ["src-reminder", "tgt-reminder"],
    ])

    await patches[0].apply(ctx as never)

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      id: "cal-new",
      confirmationFlowId: "tgt-confirm",
    })
    expect(mocks.replaceReminders.mock.calls[0][0]).toEqual({
      calendarId: "cal-new",
      reminders: [
        { flowId: "tgt-reminder", timingValue: 1, timingUnit: "hours" },
      ],
    })
    expect(ctx.warn.mock.calls.map(([warning]) => warning.path)).toEqual([
      "calendars.cal-src.cancellationFlowId",
      "calendars.cal-src.reminders.1.flowId",
    ])
  })

  test("a calendar with no flow references needs no patch task", async () => {
    const patches = await calendarsAdapter.insert(
      buildContext([]) as never,
      [entry] as never,
    )

    expect(patches).toEqual([])
  })
})
