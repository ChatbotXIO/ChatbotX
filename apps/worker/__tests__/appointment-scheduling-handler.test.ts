import { beforeEach, describe, expect, test, vi } from "vitest"

const cancelAppointment = vi.fn()
const checkAvailability = vi.fn()
const hasFutureScheduledAppointmentForContact = vi.fn()
const findCalendarByOrFail = vi.fn()
const setValues = vi.fn()
const setValueByKey = vi.fn()
const resolveTenantSettings = vi.fn()
const signAppointmentWebviewToken = vi.fn()
const chatQueueAdd = vi.fn()
const loggerWarn = vi.fn()
const LOCALE_SEPARATOR_RE = /[-_]/

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    findByOrFail: findCalendarByOrFail,
  },
  appointmentService: {
    cancelAppointment,
    checkAvailability,
    hasFutureScheduledAppointmentForContact,
  },
  contactCustomFieldService: {
    setValues,
    setValueByKey,
  },
  normalizeLanguage: (language: string | null | undefined) =>
    language?.split(LOCALE_SEPARATOR_RE)[0]?.toLowerCase(),
  resolveTenantSettings,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  signAppointmentWebviewToken,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    sendChatMessage: "sendChatMessage",
  },
  chatQueue: {
    add: chatQueueAdd,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
    error: vi.fn(),
  },
}))

const { appointmentScheduling } = await import(
  "../src/integration/handlers/appointment-scheduling"
)

const baseProps = {
  conversation: {
    id: "conversation-1",
    workspaceId: "workspace-1",
    contactId: "contact-1",
  },
  contactInbox: {
    id: "contact-inbox-1",
    channel: "messenger",
    language: "vi",
  },
  flowVersion: {
    id: "flow-version-1",
    flowId: "flow-1",
  },
  metadata: undefined,
  targetId: "node-from-props",
}

const checkAvailabilityStep = {
  id: "step-1",
  stepType: "appointmentScheduling",
  mode: "checkAvailability",
  calendarId: "calendar-1",
  startDateFieldId: "start-field",
  endDateFieldId: "end-field",
  resultUsedByAI: true,
  outputCustomFieldId: "output-field",
  states: [],
}

describe("appointmentScheduling handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findCalendarByOrFail.mockResolvedValue({
      id: "calendar-1",
      name: "Demo Calendar",
      timezone: "Asia/Ho_Chi_Minh",
    })
    setValues.mockResolvedValue(undefined)
    setValueByKey.mockResolvedValue(undefined)
    checkAvailability.mockResolvedValue({
      text: "Available: Aug 10, 9:00 AM",
      slots: [
        {
          startAt: new Date("2026-08-10T02:00:00.000Z"),
          endAt: new Date("2026-08-10T02:30:00.000Z"),
        },
      ],
    })
    hasFutureScheduledAppointmentForContact.mockResolvedValue(false)
  })

  test("sends the booking picker and propagates nodeId from the execution target", async () => {
    resolveTenantSettings.mockResolvedValueOnce({
      appUrl: "https://app.example.test",
    })
    signAppointmentWebviewToken.mockResolvedValueOnce("webview-token")

    const result = await appointmentScheduling({
      ...baseProps,
      step: {
        id: "step-1",
        stepType: "appointmentScheduling",
        mode: "book",
        calendarId: "calendar-1",
        dateTimeFieldId: "field-1",
        states: [],
        nodeId: "stale-node",
      },
    } as never)

    expect(signAppointmentWebviewToken).toHaveBeenCalledWith({
      mode: "book",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
      nodeId: "node-from-props",
      selectedDateCustomFieldId: "field-1",
    })
    expect(chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "Chọn thời gian đặt lịch",
        quickReplies: [
          expect.objectContaining({
            label: "Chọn ngày",
            buttonType: "url",
            url: "https://app.example.test/booking/picker?token=webview-token",
          }),
        ],
      }),
    })
    expect(result).toEqual({ status: "wait", result: null })
  })

  test("returns error without sending a picker when the contact already has a scheduled appointment", async () => {
    hasFutureScheduledAppointmentForContact.mockResolvedValueOnce(true)

    const result = await appointmentScheduling({
      ...baseProps,
      step: {
        id: "step-1",
        stepType: "appointmentScheduling",
        mode: "book",
        calendarId: "calendar-1",
        dateTimeFieldId: "field-1",
        states: [],
      },
    } as never)

    expect(hasFutureScheduledAppointmentForContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
    })
    expect(result).toEqual({
      status: "error",
      errorMessage: "appointment_already_scheduled",
      result: null,
    })
    expect(signAppointmentWebviewToken).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })

  test("sends the availability range picker on the first checkAvailability run", async () => {
    resolveTenantSettings.mockResolvedValueOnce({
      appUrl: "https://app.example.test",
    })
    signAppointmentWebviewToken.mockResolvedValueOnce("range-token")

    const result = await appointmentScheduling({
      ...baseProps,
      step: checkAvailabilityStep,
    } as never)

    expect(signAppointmentWebviewToken).toHaveBeenCalledWith({
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
      nodeId: "node-from-props",
      startDateCustomFieldId: "start-field",
      endDateCustomFieldId: "end-field",
      resultCustomFieldId: "output-field",
      resultUsedByAI: true,
    })
    expect(chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "Chọn khoảng ngày cần kiểm tra lịch trống",
        quickReplies: [
          expect.objectContaining({
            label: "Kiểm tra lịch trống",
            buttonType: "url",
            url: "https://app.example.test/booking/range-picker?token=range-token",
          }),
        ],
      }),
    })
    expect(checkAvailability).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "wait", result: null })
  })

  test("uses English range picker copy for non-Vietnamese contact inboxes", async () => {
    resolveTenantSettings.mockResolvedValueOnce({
      appUrl: "https://app.example.test",
    })
    signAppointmentWebviewToken.mockResolvedValueOnce("range-token")

    await appointmentScheduling({
      ...baseProps,
      contactInbox: {
        ...baseProps.contactInbox,
        language: "en",
      },
      step: checkAvailabilityStep,
    } as never)

    expect(chatQueueAdd).toHaveBeenCalledWith("sendChatMessage", {
      type: "sendChatMessage",
      data: expect.objectContaining({
        text: "Choose a date range to check availability",
        quickReplies: [
          expect.objectContaining({
            label: "Check Availability",
            buttonType: "url",
          }),
        ],
      }),
    })
  })

  test("returns error when the range picker is skipped", async () => {
    const result = await appointmentScheduling({
      ...baseProps,
      metadata: {
        type: "appointmentAvailabilityRangeSkipped",
        stepId: "step-1",
      },
      step: checkAvailabilityStep,
    } as never)

    expect(result).toEqual({
      status: "error",
      errorMessage: "range_skipped",
      result: null,
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "range_skipped" }),
      "Appointment scheduling availability range skipped",
    )
  })

  test("returns error for an invalid selected range", async () => {
    const result = await appointmentScheduling({
      ...baseProps,
      metadata: {
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        startDate: "2026-08-12T09:00:00.000",
        endDate: "2026-08-10T09:00:00.000",
      },
      step: checkAvailabilityStep,
    } as never)

    expect(result).toEqual({ status: "error", result: null })
    expect(checkAvailability).not.toHaveBeenCalled()
  })

  test("checks timezone-aware bounds, saves dates and returns success with availability", async () => {
    const result = await appointmentScheduling({
      ...baseProps,
      metadata: {
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        contactInboxId: "contact-inbox-1",
        startDate: "2026-08-10T09:00:00.000",
        endDate: "2026-08-11T17:00:00.000",
      },
      step: checkAvailabilityStep,
    } as never)

    expect(setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [
        {
          customFieldId: "start-field",
          value: "2026-08-10T09:00:00.000",
        },
        {
          customFieldId: "end-field",
          value: "2026-08-11T17:00:00.000",
        },
      ],
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      temporalInputParsing: "lenient",
    })
    expect(checkAvailability).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      startDate: new Date("2026-08-10T02:00:00.000Z"),
      endDate: new Date("2026-08-11T10:00:00.000Z"),
    })
    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "output-field",
      value: "Available: Aug 10, 9:00 AM",
    })
    expect(signAppointmentWebviewToken).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: "success",
      result: {
        text: "Available: Aug 10, 9:00 AM",
        slots: [
          {
            startAt: new Date("2026-08-10T02:00:00.000Z"),
            endAt: new Date("2026-08-10T02:30:00.000Z"),
          },
        ],
      },
    })
  })

  test("writes the output custom field even when resultUsedByAI is disabled", async () => {
    const result = await appointmentScheduling({
      ...baseProps,
      metadata: {
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        startDate: "2026-08-10T09:00:00.000",
        endDate: "2026-08-11T17:00:00.000",
      },
      step: { ...checkAvailabilityStep, resultUsedByAI: false },
    } as never)

    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "output-field",
      value: "Available: Aug 10, 9:00 AM",
    })
    expect(result.status).toBe("success")
  })

  test("returns error without sending a chat message when no slots exist", async () => {
    checkAvailability.mockResolvedValueOnce({
      text: "No available times were found.",
      slots: [],
    })

    const result = await appointmentScheduling({
      ...baseProps,
      metadata: {
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        startDate: "2026-08-10T09:00:00.000",
        endDate: "2026-08-11T09:00:00.000",
      },
      step: checkAvailabilityStep,
    } as never)

    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "output-field",
      value: "No available times were found.",
    })
    expect(result).toEqual({
      status: "error",
      result: {
        text: "No available times were found.",
        slots: [],
      },
    })
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(signAppointmentWebviewToken).not.toHaveBeenCalled()
  })
})
