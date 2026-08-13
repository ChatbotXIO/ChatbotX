import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  defaultQueueAdd: vi.fn(),
  defaultQueueRemove: vi.fn(),
  integrationQueueAdd: vi.fn(),
  getForEdit: vi.fn(),
  findAppointment: vi.fn(),
  listFutureScheduledByCalendar: vi.fn(),
  createPending: vi.fn(),
  findForSend: vi.fn(),
  listPendingJobIdsForFutureCalendar: vi.fn(),
  listDuePending: vi.fn(),
  markCancelledByAppointment: vi.fn(),
  markFailedForRetry: vi.fn(),
  markSent: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  appointmentCalendarRepository: {
    getForEdit: (...args: unknown[]) => mocks.getForEdit(...args),
  },
  appointmentRepository: {
    findBy: (...args: unknown[]) => mocks.findAppointment(...args),
    listFutureScheduledByCalendar: (...args: unknown[]) =>
      mocks.listFutureScheduledByCalendar(...args),
  },
  appointmentReminderDispatchRepository: {
    createPending: (...args: unknown[]) => mocks.createPending(...args),
    findForSend: (...args: unknown[]) => mocks.findForSend(...args),
    list: vi.fn(),
    listPendingJobIdsForFutureCalendar: (...args: unknown[]) =>
      mocks.listPendingJobIdsForFutureCalendar(...args),
    listDuePending: (...args: unknown[]) => mocks.listDuePending(...args),
    markCancelledByAppointment: (...args: unknown[]) =>
      mocks.markCancelledByAppointment(...args),
    markFailedForRetry: (...args: unknown[]) =>
      mocks.markFailedForRetry(...args),
    markSent: (...args: unknown[]) => mocks.markSent(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (input: { fn: () => unknown }) => input.fn(),
  },
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    sendAppointmentReminder: "sendAppointmentReminder",
  },
  IntegrationJobAction: {
    sendFlow: "sendFlow",
  },
  defaultQueue: {
    add: (...args: unknown[]) => mocks.defaultQueueAdd(...args),
    remove: (...args: unknown[]) => mocks.defaultQueueRemove(...args),
  },
  integrationQueue: {
    add: (...args: unknown[]) => mocks.integrationQueueAdd(...args),
  },
  sendAppointmentReminderJobId: (
    appointmentId: string,
    reminderConfigId: string,
  ) => `appt-reminder-${appointmentId}-${reminderConfigId}`,
}))

vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const { appointmentReminderService, calculateSendAt } = await import(
  "../src/appointment-reminder/service"
)

const futureAppointment = {
  id: "appointment-1",
  workspaceId: "workspace-1",
  calendarId: "calendar-1",
  startAt: new Date("2026-08-07T10:00:00.000Z"),
  status: "scheduled",
}

const calendarWithReminder = {
  id: "calendar-1",
  timezone: "UTC",
  reminders: [
    {
      id: "reminder-1",
      flowId: "flow-1",
      timingValue: 1,
      timingUnit: "hours",
    },
  ],
}

const pendingDispatch = {
  id: "dispatch-1",
  workspaceId: "workspace-1",
  appointmentId: "appointment-1",
  reminderConfigId: "reminder-1",
  sendAt: new Date("2026-08-07T09:00:00.000Z"),
  status: "pending",
  jobId: "appt-reminder-appointment-1-reminder-1",
}

describe("appointmentReminderService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-07T08:00:00.000Z"))
    mocks.getForEdit.mockResolvedValue(calendarWithReminder)
    mocks.findAppointment.mockResolvedValue(futureAppointment)
    mocks.listFutureScheduledByCalendar.mockResolvedValue([futureAppointment])
    mocks.createPending.mockResolvedValue(pendingDispatch)
    mocks.defaultQueueAdd.mockResolvedValue(undefined)
    mocks.defaultQueueRemove.mockResolvedValue(1)
    mocks.integrationQueueAdd.mockResolvedValue(undefined)
    mocks.markCancelledByAppointment.mockResolvedValue([])
    mocks.markSent.mockResolvedValue({ ...pendingDispatch, status: "sent" })
  })

  test("skips reminder rows whose send time is already past", async () => {
    vi.setSystemTime(new Date("2026-08-07T09:30:00.000Z"))

    await expect(
      appointmentReminderService.scheduleForAppointment({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        calendarId: "calendar-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.createPending).not.toHaveBeenCalled()
    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
  })

  test("keeps day-based reminders at the same local time across DST", () => {
    expect(
      calculateSendAt({
        startAt: new Date("2026-03-08T14:00:00.000Z"),
        timingValue: 1,
        timingUnit: "days",
        timezone: "America/New_York",
      }),
    ).toEqual(new Date("2026-03-07T15:00:00.000Z"))
  })

  test("creates one pending dispatch and delayed queue job per future reminder", async () => {
    await expect(
      appointmentReminderService.scheduleForAppointment({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        calendarId: "calendar-1",
      }),
    ).resolves.toEqual([pendingDispatch])

    expect(mocks.createPending).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      reminderConfigId: "reminder-1",
      contactInboxId: undefined,
      sendAt: new Date("2026-08-07T09:00:00.000Z"),
      jobId: "appt-reminder-appointment-1-reminder-1",
    })
    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "sendAppointmentReminder",
      {
        type: "sendAppointmentReminder",
        data: {
          workspaceId: "workspace-1",
          appointmentId: "appointment-1",
          reminderDispatchId: "dispatch-1",
          reminderConfigId: "reminder-1",
        },
      },
      expect.objectContaining({
        delay: 60 * 60 * 1000,
        jobId: "appt-reminder-appointment-1-reminder-1",
        removeOnFail: true,
      }),
    )
    expect(mocks.defaultQueueAdd.mock.calls[0]?.[2].jobId).not.toContain(":")
  })

  test("persists the booking contact inbox on new dispatch rows", async () => {
    await appointmentReminderService.scheduleForAppointment({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      calendarId: "calendar-1",
      contactInboxId: "contact-inbox-1",
    })

    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInboxId: "contact-inbox-1",
      }),
    )
  })

  test("does not schedule reminders for cancelled appointments", async () => {
    mocks.findAppointment.mockResolvedValueOnce({
      ...futureAppointment,
      status: "cancelled",
    })

    await expect(
      appointmentReminderService.scheduleForAppointment({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        calendarId: "calendar-1",
      }),
    ).resolves.toEqual([])

    expect(mocks.createPending).not.toHaveBeenCalled()
    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
  })

  test("reschedules future calendar appointments and removes stale jobs once", async () => {
    await expect(
      appointmentReminderService.rescheduleFutureForCalendar({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        staleJobIds: ["old-job-1", "old-job-1", "old-job-2"],
      }),
    ).resolves.toEqual({
      appointmentsScanned: 1,
      dispatchesCreated: 1,
      jobsRemoved: 2,
      failedRemovals: 0,
    })

    expect(mocks.defaultQueueRemove).toHaveBeenCalledTimes(2)
    expect(mocks.defaultQueueRemove).toHaveBeenCalledWith("old-job-1")
    expect(mocks.defaultQueueRemove).toHaveBeenCalledWith("old-job-2")
    expect(mocks.listFutureScheduledByCalendar).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      now: undefined,
    })
    expect(mocks.defaultQueueAdd.mock.calls[0]?.[2].jobId).toBe(
      "appt-reminder-appointment-1-reminder-1",
    )
    expect(mocks.defaultQueueAdd.mock.calls[0]?.[2].jobId).not.toContain(":")
  })

  test("cancels pending dispatches and removes delayed jobs best-effort", async () => {
    mocks.markCancelledByAppointment.mockResolvedValueOnce([pendingDispatch])

    await expect(
      appointmentReminderService.cancelPendingForAppointment({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
      }),
    ).resolves.toEqual([pendingDispatch])

    expect(mocks.markCancelledByAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
    })
    expect(mocks.defaultQueueRemove).toHaveBeenCalledWith(
      "appt-reminder-appointment-1-reminder-1",
    )
  })

  test("scanner re-enqueues due pending dispatch rows", async () => {
    mocks.listDuePending.mockResolvedValueOnce([pendingDispatch])

    await expect(
      appointmentReminderService.enqueueDuePending({
        now: new Date("2026-08-07T09:00:00.000Z"),
      }),
    ).resolves.toEqual({ scanned: 1, enqueued: 1 })

    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "sendAppointmentReminder",
      expect.objectContaining({
        data: expect.objectContaining({
          reminderDispatchId: "dispatch-1",
        }),
      }),
      expect.objectContaining({
        delay: 60 * 60 * 1000,
        jobId: "appt-reminder-appointment-1-reminder-1",
      }),
    )
  })

  test("stale or cancelled appointments are no-ops and cancel the dispatch", async () => {
    mocks.findForSend.mockResolvedValueOnce({
      ...pendingDispatch,
      appointment: {
        id: "appointment-1",
        status: "cancelled",
        startAt: new Date("2026-08-07T10:00:00.000Z"),
      },
      reminderConfig: {
        flowId: "flow-1",
      },
    })

    await expect(
      appointmentReminderService.sendDispatch({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        reminderDispatchId: "dispatch-1",
        reminderConfigId: "reminder-1",
      }),
    ).resolves.toEqual({ sent: false, reason: "staleAppointment" })

    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
    expect(mocks.markCancelledByAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      dispatchIds: ["dispatch-1"],
    })
  })

  test("sends the reminder flow once and marks the dispatch sent", async () => {
    mocks.findForSend.mockResolvedValueOnce({
      ...pendingDispatch,
      appointment: {
        id: "appointment-1",
        status: "scheduled",
        startAt: new Date("2026-08-07T10:00:00.000Z"),
        conversation: {
          id: "conversation-1",
          contactInboxes: [{ id: "contact-inbox-1" }],
        },
      },
      reminderConfig: {
        flowId: "flow-1",
      },
    })

    await expect(
      appointmentReminderService.sendDispatch({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        reminderDispatchId: "dispatch-1",
        reminderConfigId: "reminder-1",
      }),
    ).resolves.toEqual({ sent: true, reason: "sent" })

    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      {
        type: "sendFlow",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          flowId: "flow-1",
          origin: "channel",
          appointmentId: "appointment-1",
        },
      },
      { jobId: "appt-reminder-flow-dispatch-1" },
    )
    expect(mocks.markSent).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "dispatch-1",
    })
  })

  test("prefers the persisted contact inbox over the current conversation inbox", async () => {
    mocks.findForSend.mockResolvedValueOnce({
      ...pendingDispatch,
      contactInbox: { id: "contact-inbox-original" },
      appointment: {
        id: "appointment-1",
        status: "scheduled",
        startAt: new Date("2026-08-07T10:00:00.000Z"),
        conversation: {
          id: "conversation-1",
          contactInboxes: [{ id: "contact-inbox-current" }],
        },
      },
      reminderConfig: {
        flowId: "flow-1",
      },
    })

    await appointmentReminderService.sendDispatch({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      reminderDispatchId: "dispatch-1",
      reminderConfigId: "reminder-1",
    })

    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({
          contactInboxId: "contact-inbox-original",
        }),
      }),
      { jobId: "appt-reminder-flow-dispatch-1" },
    )
  })
})
