import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  replaceReminders: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  createPublishedDefault: vi.fn(),
  invalidateList: vi.fn(),
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
    create: mocks.create,
    update: mocks.update,
    replaceReminders: mocks.replaceReminders,
  },
  appointmentReminderDispatchRepository: {},
}))

vi.mock("../src/appointment-external-calendar", () => ({
  appointmentExternalCalendarService: {},
}))

vi.mock("../src/flow/service", () => ({
  flowService: {
    createPublishedDefault: mocks.createPublishedDefault,
  },
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    invalidateList: mocks.invalidateList,
  },
}))

const { appointmentCalendarService } = await import(
  "../src/appointment-calendar/service"
)

describe("appointmentCalendarService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.create.mockResolvedValue({
      id: "calendar-1",
      name: "Lich_1",
      publicLinkSlug: "slug-1",
    })
    mocks.createPublishedDefault
      .mockResolvedValueOnce({
        flowId: "confirmation-flow-1",
        draftVersionId: "draft-1",
        publishedVersionId: "published-1",
      })
      .mockResolvedValueOnce({
        flowId: "reminder-flow-1",
        draftVersionId: "draft-2",
        publishedVersionId: "published-2",
      })
    mocks.update.mockResolvedValue({ id: "calendar-1" })
    mocks.replaceReminders.mockResolvedValue([])
  })

  test("provisions a confirmation flow, a reminder flow, and 3 default reminders", async () => {
    const calendarId = await appointmentCalendarService.create({
      workspaceId: "workspace-1",
      name: "Lich_1",
    })

    expect(calendarId).toBe("calendar-1")

    expect(mocks.createPublishedDefault).toHaveBeenCalledTimes(2)
    expect(mocks.createPublishedDefault).toHaveBeenNthCalledWith(
      1,
      "tx",
      expect.objectContaining({
        workspaceId: "workspace-1",
        name: "Booking confirmation - Lich_1",
        nodes: [
          expect.objectContaining({
            type: "sendMessage",
            data: expect.objectContaining({
              name: "Start",
              isStartNode: true,
              details: expect.objectContaining({
                steps: [
                  expect.objectContaining({
                    stepType: "sendText",
                    text: "Appointment Confirmation - {{booking_calendar}}\n\nDate: {{booking_date}}",
                    buttons: [
                      expect.objectContaining({
                        label: "More Information",
                        buttonType: "openWebsite",
                        beforeStep: expect.objectContaining({
                          url: "{{booking_link}}",
                        }),
                      }),
                    ],
                  }),
                ],
              }),
            }),
          }),
        ],
      }),
    )
    expect(mocks.createPublishedDefault).toHaveBeenNthCalledWith(
      2,
      "tx",
      expect.objectContaining({
        workspaceId: "workspace-1",
        name: "Reminder - Lich_1",
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              details: expect.objectContaining({
                steps: [
                  expect.objectContaining({
                    text: "Reminder - {{booking_calendar}}\n\nDate: {{booking_date}}",
                  }),
                ],
              }),
            }),
          }),
        ],
      }),
    )

    expect(mocks.update).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        id: "calendar-1",
        confirmationFlowId: "confirmation-flow-1",
      },
      "tx",
    )

    expect(mocks.replaceReminders).toHaveBeenCalledWith(
      {
        calendarId: "calendar-1",
        reminders: [
          { flowId: "reminder-flow-1", timingValue: 10, timingUnit: "minutes" },
          { flowId: "reminder-flow-1", timingValue: 1, timingUnit: "hours" },
          { flowId: "reminder-flow-1", timingValue: 1, timingUnit: "days" },
        ],
      },
      "tx",
    )

    expect(mocks.invalidateList).toHaveBeenCalledWith("confirmation-flow-1")
    expect(mocks.invalidateList).toHaveBeenCalledWith("reminder-flow-1")
  })

  test("maps a unique name violation to a friendly error", async () => {
    mocks.create.mockRejectedValueOnce(new Error("duplicate key"))
    mocks.isUniqueViolationError.mockReturnValueOnce(true)

    await expect(
      appointmentCalendarService.create({
        workspaceId: "workspace-1",
        name: "Lich_1",
      }),
    ).rejects.toMatchObject({ code: "nameAlreadyExists" })

    expect(mocks.createPublishedDefault).not.toHaveBeenCalled()
    expect(mocks.invalidateList).not.toHaveBeenCalled()
  })
})
