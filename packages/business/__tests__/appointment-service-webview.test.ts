import { formatInTimeZone } from "date-fns-tz"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findBy: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  listByContact: vi.fn(),
  listFutureScheduledForContact: vi.fn(),
  cancelScheduled: vi.fn(),
  softDelete: vi.fn(),
  markCancelledByAppointment: vi.fn(),
  contactInboxFindByUncached: vi.fn(),
  defaultQueueRemove: vi.fn(),
  defaultQueueAdd: vi.fn(),
  chatQueueAdd: vi.fn(),
  integrationQueueAdd: vi.fn(),
  findCalendarByOrFail: vi.fn(),
  hasExternalBusyConflictForSlot: vi.fn(),
  prepareAvailabilityContext: vi.fn(),
  generateAvailableSlots: vi.fn(),
  resolveAvailableSlotsForListing: vi.fn(),
  txExecute: vi.fn(),
  syncExternalCalendarEventJobId: vi.fn(
    (appointmentId: string, operation: string) =>
      `sync-external-event-${appointmentId}-${operation}`,
  ),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  appointmentRepository: {
    findBy: (...args: unknown[]) => mocks.findBy(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    list: (...args: unknown[]) => mocks.list(...args),
    listByContact: (...args: unknown[]) => mocks.listByContact(...args),
    listFutureScheduledForContact: (...args: unknown[]) =>
      mocks.listFutureScheduledForContact(...args),
    cancelScheduled: (...args: unknown[]) => mocks.cancelScheduled(...args),
    softDelete: (...args: unknown[]) => mocks.softDelete(...args),
  },
  appointmentReminderDispatchRepository: {
    markCancelledByAppointment: (...args: unknown[]) =>
      mocks.markCancelledByAppointment(...args),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  buildAppointmentCancelPostback: (token: string) =>
    `appointment_cancel:${token}`,
  signAppointmentCancelToken: vi.fn(async () => "cancel-token"),
  signAppointmentScheduleToken: vi.fn(async () => "schedule-token"),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChatMessage: "sendChatMessage",
  },
  DefaultJobAction: {
    syncExternalCalendarEvent: "syncExternalCalendarEvent",
  },
  IntegrationJobAction: {
    sendFlow: "sendFlow",
  },
  defaultQueue: {
    add: (...args: unknown[]) => mocks.defaultQueueAdd(...args),
    remove: (...args: unknown[]) => mocks.defaultQueueRemove(...args),
  },
  chatQueue: {
    add: (...args: unknown[]) => mocks.chatQueueAdd(...args),
  },
  integrationQueue: {
    add: (...args: unknown[]) => mocks.integrationQueueAdd(...args),
  },
  syncExternalCalendarEventJobId: (...args: [string, "create" | "cancel"]) =>
    mocks.syncExternalCalendarEventJobId(...args),
}))

vi.mock("../src/appointment-calendar", () => ({
  appointmentCalendarService: {
    findByOrFail: (...args: unknown[]) => mocks.findCalendarByOrFail(...args),
    prepareAvailabilityContext: (...args: unknown[]) =>
      mocks.prepareAvailabilityContext(...args),
    hasExternalBusyConflictForSlot: (...args: unknown[]) =>
      mocks.hasExternalBusyConflictForSlot(...args),
    generateAvailableSlots: (...args: unknown[]) =>
      mocks.generateAvailableSlots(...args),
    resolveAvailableSlotsForListing: (...args: unknown[]) =>
      mocks.resolveAvailableSlotsForListing(...args),
  },
  matchesAvailabilityFingerprint: vi.fn(() => true),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    findByUncached: (...args: unknown[]) =>
      mocks.contactInboxFindByUncached(...args),
  },
}))

const { appointmentService } = await import("../src/appointment/service")

const futureAppointment = {
  id: "appointment-1",
  workspaceId: "workspace-1",
  calendarId: "calendar-1",
  contactId: "contact-1",
  conversationId: "conversation-1",
  startAt: new Date("2099-01-01T10:00:00.000Z"),
  endAt: new Date("2099-01-01T10:30:00.000Z"),
  inviteeTimezone: "UTC",
  status: "scheduled",
  locationType: "onlineMeeting",
  locationDetail: null,
  externalSyncStatus: null,
  cancelledAt: null,
  deletedAt: null,
  calendar: {
    id: "calendar-1",
    name: "Demo Calendar",
    externalConnectionId: "integration-1",
    confirmationFlowId: "confirmation-flow-1",
    cancellationFlowId: "flow-1",
    confirmationMessage: null,
  },
  contact: {
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    email: null,
    phoneNumber: null,
  },
}

const createdAppointment = {
  id: "appointment-1",
  workspaceId: "workspace-1",
  calendarId: "calendar-1",
  contactId: "contact-1",
  conversationId: "conversation-1",
  startAt: new Date("2099-01-01T10:00:00.000Z"),
  endAt: new Date("2099-01-01T10:30:00.000Z"),
  inviteeTimezone: "UTC",
  status: "scheduled",
  locationType: "onlineMeeting",
  locationDetail: null,
  externalSyncStatus: null,
  cancelledAt: null,
  deletedAt: null,
}

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  contactId: "contact-1",
}

const contactInbox = {
  id: "contact-inbox-1",
  workspaceId: "workspace-1",
  contactId: "contact-1",
  channel: "messenger",
  sourceId: "psid-1",
}

const fullAppointment = {
  ...futureAppointment,
  conversation,
}

describe("appointmentService.listContactAppointments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listByContact.mockResolvedValue([
      {
        id: "appointment-1",
        workspaceId: "workspace-1",
        contactId: "contact-1",
        calendarName: "Demo Calendar",
        startAt: new Date("2099-01-01T10:00:00.000Z"),
      },
    ])
  })

  test("lists appointments for one workspace contact through the repository", async () => {
    await expect(
      appointmentService.listContactAppointments({
        workspaceId: "workspace-1",
        contactId: "contact-1",
      }),
    ).resolves.toHaveLength(1)

    expect(mocks.listByContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})

describe("appointmentService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({
      data: [
        {
          ...createdAppointment,
          calendarName: "Demo Calendar",
          contactFirstName: "Ada",
          contactLastName: "Lovelace",
          contactFullName: "Ada Lovelace",
        },
      ],
      total: 1,
      pageCount: 1,
    })
  })

  test("lists appointments and signs schedule detail URLs", async () => {
    await expect(
      appointmentService.list({
        workspaceId: "workspace-1",
        tab: "next",
        search: "Ada",
        page: 2,
        perPage: 5,
        appUrl: "https://app.example.test",
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: "appointment-1",
          contactName: "Ada Lovelace",
          scheduleUrl:
            "https://app.example.test/booking/schedule?token=schedule-token",
          cancellable: true,
          deletable: false,
        },
      ],
      total: 1,
      pageCount: 1,
    })

    expect(mocks.list).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        calendarId: undefined,
        tab: "next",
        search: "Ada",
        page: 2,
        perPage: 5,
      },
      undefined,
    )
  })
})

describe("appointmentService.cancelAppointmentByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.findBy.mockResolvedValue(futureAppointment)
    mocks.cancelScheduled.mockResolvedValue({
      ...futureAppointment,
      status: "cancelled",
      cancelledAt: new Date("2099-01-01T09:00:00.000Z"),
    })
    mocks.markCancelledByAppointment.mockResolvedValue([])
    mocks.defaultQueueRemove.mockResolvedValue(0)
  })

  test("cancels once and enqueues external sync for the winning request", async () => {
    await expect(
      appointmentService.cancelAppointmentByToken({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        contactId: "contact-1",
      }),
    ).resolves.toMatchObject({ cancellable: true })

    expect(mocks.cancelScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        id: "appointment-1",
        externalSyncStatus: "pending",
      }),
      "tx",
    )
    expect(mocks.markCancelledByAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
    })
    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "syncExternalCalendarEvent",
      {
        type: "syncExternalCalendarEvent",
        data: {
          workspaceId: "workspace-1",
          appointmentId: "appointment-1",
          operation: "cancel",
        },
      },
      { jobId: "sync-external-event-appointment-1-cancel" },
    )
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("does not run side effects when the conditional cancel loses the race", async () => {
    mocks.cancelScheduled.mockResolvedValue(undefined)

    await expect(
      appointmentService.cancelAppointmentByToken({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        contactId: "contact-1",
      }),
    ).resolves.toMatchObject({ cancellable: false })

    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("rejects a token payload for a different contact", async () => {
    await expect(
      appointmentService.cancelAppointmentByToken({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        contactId: "contact-2",
      }),
    ).rejects.toThrow("Appointment not found")

    expect(mocks.cancelScheduled).not.toHaveBeenCalled()
  })
})

describe("appointmentService.cancelAppointmentById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.findBy.mockResolvedValue(futureAppointment)
    mocks.cancelScheduled.mockResolvedValue({
      ...futureAppointment,
      status: "cancelled",
      cancelledAt: new Date("2099-01-01T09:00:00.000Z"),
    })
    mocks.markCancelledByAppointment.mockResolvedValue([])
    mocks.defaultQueueRemove.mockResolvedValue(0)
  })

  test("cancels an upcoming scheduled appointment through the shared side effects", async () => {
    await expect(
      appointmentService.cancelAppointmentById({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
      }),
    ).resolves.toMatchObject({ id: "appointment-1", status: "cancelled" })

    expect(mocks.cancelScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        id: "appointment-1",
        externalSyncStatus: "pending",
      }),
      "tx",
    )
    expect(mocks.markCancelledByAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
    })
    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "syncExternalCalendarEvent",
      expect.objectContaining({
        data: {
          workspaceId: "workspace-1",
          appointmentId: "appointment-1",
          operation: "cancel",
        },
      }),
      { jobId: "sync-external-event-appointment-1-cancel" },
    )
  })
})

describe("appointmentService.deleteAppointmentById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.softDelete.mockResolvedValue({
      ...createdAppointment,
      deletedAt: new Date("2099-01-01T09:00:00.000Z"),
    })
  })

  test("blocks deleting upcoming scheduled appointments", async () => {
    mocks.findBy.mockResolvedValue(futureAppointment)

    await expect(
      appointmentService.deleteAppointmentById({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
      }),
    ).rejects.toThrow("Cancel upcoming appointments before deleting them")

    expect(mocks.softDelete).not.toHaveBeenCalled()
  })

  test("soft-deletes appointments that are not upcoming scheduled", async () => {
    mocks.findBy.mockResolvedValue({
      ...futureAppointment,
      status: "cancelled",
    })

    await expect(
      appointmentService.deleteAppointmentById({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
      }),
    ).resolves.toMatchObject({ id: "appointment-1" })

    expect(mocks.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        id: "appointment-1",
        deletedAt: expect.any(Date),
      }),
      "tx",
    )
    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })
})

describe("appointmentService.checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "calendar-1",
      name: "Demo Calendar",
      timezone: "UTC",
    })
  })

  test("caps the formatted text to the 30 slots nearest to startDate", async () => {
    const slots = Array.from({ length: 45 }, (_, index) => {
      const startAt = new Date(
        Date.UTC(2099, 0, 1, 9, 0, 0) + index * 30 * 60 * 1000,
      )
      return { startAt, endAt: new Date(startAt.getTime() + 30 * 60 * 1000) }
    })
    mocks.resolveAvailableSlotsForListing.mockResolvedValue(slots)

    const result = await appointmentService.checkAvailability({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: new Date("2099-01-05T00:00:00.000Z"),
    })

    expect(result.slots).toHaveLength(45)
    expect(result.text.match(/2099/g)).toHaveLength(30)
    expect(result.text).not.toContain("Available slots")
    expect(result.text).not.toContain(
      formatInTimeZone(
        // biome-ignore lint/style/noNonNullAssertion: test fixture always has a last slot
        slots.at(-1)!.startAt,
        "UTC",
        "yyyy-MM-dd hh:mm:ss a",
      ),
    )
  })

  test("formats slots without a text prefix", async () => {
    const startAt = new Date(Date.UTC(2026, 7, 26, 3, 10, 0))
    mocks.resolveAvailableSlotsForListing.mockResolvedValue([
      { startAt, endAt: new Date(startAt.getTime() + 5 * 60 * 1000) },
    ])

    const result = await appointmentService.checkAvailability({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      startDate: new Date("2026-08-26T00:00:00.000Z"),
      endDate: new Date("2026-08-26T23:59:59.000Z"),
    })

    expect(result.text).toBe("2026-08-26 03:10:00 AM")
  })
})

describe("appointmentService.completeWebviewBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const tx = { execute: mocks.txExecute }
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn(tx),
    )
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "calendar-1",
      name: "Demo Calendar",
      active: true,
      timezone: "UTC",
      updatedAt: new Date("2099-01-01T00:00:00.000Z"),
      durationMinutes: 30,
      locationType: "onlineMeeting",
      locationDetail: null,
      externalConnectionId: null,
      confirmationFlowId: "confirmation-flow-1",
    })
    mocks.prepareAvailabilityContext.mockResolvedValue({
      calendarFingerprint: {
        externalConnectionId: null,
        timezone: "UTC",
        updatedAt: new Date("2099-01-01T00:00:00.000Z").getTime(),
      },
      externalBusyIntervals: [],
      listingEmpty: false,
    })
    mocks.hasExternalBusyConflictForSlot.mockResolvedValue(false)
    mocks.generateAvailableSlots.mockResolvedValue([
      {
        startAt: new Date("2099-01-01T10:00:00.000Z"),
        endAt: new Date("2099-01-01T10:30:00.000Z"),
      },
    ])
    mocks.listFutureScheduledForContact.mockResolvedValue([])
    mocks.create.mockResolvedValue(createdAppointment)
    mocks.findBy.mockResolvedValue(fullAppointment)
    mocks.contactInboxFindByUncached.mockResolvedValue(contactInbox)
    mocks.defaultQueueAdd.mockResolvedValue(undefined)
    mocks.chatQueueAdd.mockResolvedValue(undefined)
    mocks.integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("books the slot, sends the default confirmation, then enqueues the configured confirmation flow", async () => {
    await expect(
      appointmentService.completeWebviewBooking({
        tokenPayload: {
          workspaceId: "workspace-1",
          calendarId: "calendar-1",
          contactId: "contact-1",
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          stepId: "step-1",
          expiresAt: Date.now() + 60_000,
        },
        selectedStartAt: new Date("2099-01-01T10:00:00.000Z"),
        inviteeTimezone: "UTC",
        appUrl: "https://app.example.test",
      }),
    ).resolves.toMatchObject({
      scheduleUrl: expect.stringContaining("/booking/schedule?token="),
      cancelUrl: expect.stringContaining("/booking/cancel?token="),
    })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        conversation,
        contactInbox,
        text: [
          "Appointment Confirmation - Demo Calendar",
          "",
          "Date: 01/Jan/2099\n10:00",
        ].join("\n"),
        quickReplies: [
          expect.objectContaining({
            buttonType: "url",
            label: "More Information",
            url: expect.stringContaining("/booking/schedule?token="),
          }),
        ],
      }),
    })
    expect(mocks.txExecute).toHaveBeenCalledTimes(2)
    expect(mocks.hasExternalBusyConflictForSlot).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      externalConnectionId: null,
      startAt: new Date("2099-01-01T10:00:00.000Z"),
      endAt: new Date("2099-01-01T10:30:00.000Z"),
    })
    expect(mocks.integrationQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        flowId: "confirmation-flow-1",
      }),
    })
    expect(
      mocks.integrationQueueAdd.mock.calls[0]?.[1].data,
    ).not.toHaveProperty("flowVersionId", "flow-version-1")
  })

  test("rejects booking when the contact already has a scheduled appointment for the calendar", async () => {
    mocks.listFutureScheduledForContact.mockResolvedValueOnce([
      futureAppointment,
    ])

    await expect(
      appointmentService.completeWebviewBooking({
        tokenPayload: {
          workspaceId: "workspace-1",
          calendarId: "calendar-1",
          contactId: "contact-1",
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          stepId: "step-1",
          expiresAt: Date.now() + 60_000,
        },
        selectedStartAt: new Date("2099-01-01T10:00:00.000Z"),
        inviteeTimezone: "UTC",
        appUrl: "https://app.example.test",
      }),
    ).rejects.toMatchObject({ code: "appointmentAlreadyScheduled" })

    expect(mocks.listFutureScheduledForContact).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        startAt: new Date("2099-01-01T10:00:00.000Z"),
      }),
      expect.objectContaining({ execute: mocks.txExecute }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("throws slot unavailable when external slot revalidation conflicts", async () => {
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "calendar-1",
      name: "Demo Calendar",
      active: true,
      timezone: "UTC",
      updatedAt: new Date("2099-01-01T00:00:00.000Z"),
      durationMinutes: 30,
      locationType: "onlineMeeting",
      locationDetail: null,
      externalConnectionId: "integration-1",
      confirmationFlowId: "confirmation-flow-1",
    })
    mocks.hasExternalBusyConflictForSlot.mockResolvedValue(true)

    await expect(
      appointmentService.bookAppointment({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        startAt: new Date("2099-01-01T10:00:00.000Z"),
        inviteeTimezone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "slotUnavailable" })

    expect(mocks.generateAvailableSlots).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("throws slot unavailable when a webview booking is outside the token range", async () => {
    await expect(
      appointmentService.completeWebviewBooking({
        tokenPayload: {
          workspaceId: "workspace-1",
          calendarId: "calendar-1",
          contactId: "contact-1",
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          stepId: "step-1",
          availabilityStartAt: "2099-01-01T00:00:00.000Z",
          availabilityEndAt: "2099-01-01T09:59:59.999Z",
          expiresAt: Date.now() + 60_000,
        },
        selectedStartAt: new Date("2099-01-01T10:00:00.000Z"),
        inviteeTimezone: "UTC",
        appUrl: "https://app.example.test",
      }),
    ).rejects.toMatchObject({ code: "slotUnavailable" })

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("keeps the fixed confirmation body for Vietnamese contacts", async () => {
    const vietnameseAppointment = {
      ...fullAppointment,
      contact: {
        ...fullAppointment.contact,
        language: "vi",
      },
    }
    mocks.findBy
      .mockResolvedValueOnce(vietnameseAppointment)
      .mockResolvedValueOnce(vietnameseAppointment)

    await appointmentService.completeWebviewBooking({
      tokenPayload: {
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        stepId: "step-1",
        expiresAt: Date.now() + 60_000,
      },
      selectedStartAt: new Date("2099-01-01T10:00:00.000Z"),
      inviteeTimezone: "UTC",
      appUrl: "https://app.example.test",
    })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: [
          "Appointment Confirmation - Demo Calendar",
          "",
          "Date: 01/Jan/2099\n10:00",
        ].join("\n"),
        quickReplies: [
          expect.objectContaining({
            buttonType: "url",
            label: "Xem thêm",
          }),
        ],
      }),
    })
  })

  test("ignores custom confirmation message in the booking confirmation body", async () => {
    const customMessageAppointment = {
      ...fullAppointment,
      calendar: {
        ...fullAppointment.calendar,
        confirmationMessage: "  Cuộc hẹn sẽ bắt đầu sau 10 phút  ",
      },
    }
    mocks.findBy
      .mockResolvedValueOnce(customMessageAppointment)
      .mockResolvedValueOnce(customMessageAppointment)

    await appointmentService.completeWebviewBooking({
      tokenPayload: {
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        stepId: "step-1",
        expiresAt: Date.now() + 60_000,
      },
      selectedStartAt: new Date("2099-01-01T10:00:00.000Z"),
      inviteeTimezone: "UTC",
      appUrl: "https://app.example.test",
    })

    expect(mocks.chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: [
          "Appointment Confirmation - Demo Calendar",
          "",
          "Date: 01/Jan/2099\n10:00",
        ].join("\n"),
        quickReplies: [
          expect.objectContaining({
            buttonType: "url",
            label: "More Information",
            url: expect.stringContaining("/booking/schedule?token="),
          }),
        ],
      }),
    })
  })
})
