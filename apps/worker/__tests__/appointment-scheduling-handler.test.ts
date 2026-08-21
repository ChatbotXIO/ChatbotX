import { beforeEach, describe, expect, test, vi } from "vitest"

const cancelAppointment = vi.fn()
const checkAvailability = vi.fn()
const hasFutureScheduledAppointmentForContact = vi.fn()
const bookAppointment = vi.fn()
const findCalendarByOrFail = vi.fn()
const setValues = vi.fn()
const setValueByKey = vi.fn()
const findValue = vi.fn()
const resolveTenantSettings = vi.fn()
const signAppointmentWebviewToken = vi.fn()
const chatQueueAdd = vi.fn()
const loggerWarn = vi.fn()
const LOCALE_SEPARATOR_RE = /[-_]/

class MockSlotUnavailableException extends Error {}
class MockAppointmentAvailabilityChangedException extends Error {}
class MockAppointmentAlreadyScheduledException extends Error {}

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    findByOrFail: findCalendarByOrFail,
  },
  appointmentService: {
    bookAppointment,
    cancelAppointment,
    checkAvailability,
    hasFutureScheduledAppointmentForContact,
  },
  contactCustomFieldService: {
    findValue,
    setValues,
    setValueByKey,
  },
  normalizeLanguage: (language: string | null | undefined) =>
    language?.split(LOCALE_SEPARATOR_RE)[0]?.toLowerCase(),
  resolveTenantSettings,
  SlotUnavailableException: MockSlotUnavailableException,
  AppointmentAvailabilityChangedException:
    MockAppointmentAvailabilityChangedException,
  AppointmentAlreadyScheduledException:
    MockAppointmentAlreadyScheduledException,
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
  targetNodeId: "node-from-props",
}

const checkAvailabilityStep = {
  id: "step-1",
  stepType: "appointmentScheduling",
  mode: "checkAvailability",
  calendarId: "calendar-1",
  startDateFieldId: "start-field",
  endDateFieldId: "end-field",
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
      // A "book" step entered via a quick-reply/button has targetId set to
      // the button's own id, not the containing node's id — the resume token
      // must use targetNodeId (which is always the containing node) instead.
      targetId: "clicked-button-id",
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
      mode: "selectAvailability",
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

  test("still opens the picker for 'book' even when the contact already has a scheduled appointment (bookFromCustomField enforces the guard)", async () => {
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
      },
    } as never)

    expect(hasFutureScheduledAppointmentForContact).not.toHaveBeenCalled()
    expect(signAppointmentWebviewToken).toHaveBeenCalled()
    expect(chatQueueAdd).toHaveBeenCalled()
    expect(result).toEqual({ status: "wait", result: null })
  })

  const bookStep = {
    id: "step-1",
    stepType: "appointmentScheduling",
    mode: "book",
    calendarId: "calendar-1",
    dateTimeFieldId: "field-1",
    states: [],
  }

  test("book: does not book on picker resume — the selection is already saved to the custom field, and booking happens in the downstream bookFromCustomField step", async () => {
    const metadata = {
      type: "appointmentWebviewSelection",
      stepId: "step-1",
      selectedStartAt: "2026-08-10T02:00:00.000Z",
    }

    const result = await appointmentScheduling({
      ...baseProps,
      metadata,
      step: bookStep,
    } as never)

    expect(bookAppointment).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "success", result: metadata })
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

  test("saves the selected range and returns success without recomputing availability", async () => {
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
    expect(checkAvailability).not.toHaveBeenCalled()
    expect(setValueByKey).not.toHaveBeenCalled()
    expect(signAppointmentWebviewToken).not.toHaveBeenCalled()
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "success", result: null })
  })

  const bookFromCustomFieldStep = {
    id: "step-1",
    stepType: "appointmentScheduling",
    mode: "bookFromCustomField",
    calendarId: "calendar-1",
    dateTimeFieldId: "date-field",
    states: [],
  }

  test("bookFromCustomField: returns error without booking when the contact already has a scheduled appointment", async () => {
    hasFutureScheduledAppointmentForContact.mockResolvedValueOnce(true)

    const result = await appointmentScheduling({
      ...baseProps,
      step: bookFromCustomFieldStep,
    } as never)

    expect(result).toEqual({
      status: "error",
      errorMessage: "appointment_already_scheduled",
      result: null,
    })
    expect(findValue).not.toHaveBeenCalled()
    expect(bookAppointment).not.toHaveBeenCalled()
  })

  test("bookFromCustomField: returns error when the date/time custom field is empty", async () => {
    findValue.mockResolvedValueOnce(null)

    const result = await appointmentScheduling({
      ...baseProps,
      step: bookFromCustomFieldStep,
    } as never)

    expect(findValue).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "date-field",
    })
    expect(result).toEqual({
      status: "error",
      errorMessage: "invalidDateTimeFieldValue",
      result: null,
    })
    expect(bookAppointment).not.toHaveBeenCalled()
  })

  test("bookFromCustomField: returns error when the date/time custom field does not parse", async () => {
    findValue.mockResolvedValueOnce("not-a-date")

    const result = await appointmentScheduling({
      ...baseProps,
      step: bookFromCustomFieldStep,
    } as never)

    expect(result).toEqual({
      status: "error",
      errorMessage: "invalidDateTimeFieldValue",
      result: null,
    })
    expect(bookAppointment).not.toHaveBeenCalled()
  })

  test("bookFromCustomField: books directly from the custom field value on success", async () => {
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")
    bookAppointment.mockResolvedValueOnce({ id: "appointment-1" })

    const result = await appointmentScheduling({
      ...baseProps,
      step: bookFromCustomFieldStep,
    } as never)

    expect(bookAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      startAt: new Date("2026-08-10T09:00:00.000Z"),
      metadata: undefined,
    })
    expect(chatQueueAdd).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: "success",
      result: { id: "appointment-1" },
    })
  })

  test.each([
    [MockSlotUnavailableException, "slot_unavailable"],
    [MockAppointmentAvailabilityChangedException, "availability_changed"],
    [MockAppointmentAlreadyScheduledException, "appointment_already_scheduled"],
  ])("bookFromCustomField: maps %s to errorMessage %s", async (ExceptionClass, errorMessage) => {
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")
    bookAppointment.mockRejectedValueOnce(new ExceptionClass())

    const result = await appointmentScheduling({
      ...baseProps,
      step: bookFromCustomFieldStep,
    } as never)

    expect(result).toEqual({ status: "error", errorMessage, result: null })
  })

  const checkAvailabilityFromCustomFieldStep = {
    id: "step-1",
    stepType: "appointmentScheduling",
    mode: "checkAvailabilityFromCustomField",
    calendarId: "calendar-1",
    startDateFieldId: "start-field",
    endDateFieldId: "end-field",
    resultUsedByAI: false,
    outputCustomFieldId: "output-field",
    states: [],
  }

  test("checkAvailabilityFromCustomField: returns error when the range is invalid", async () => {
    findValue.mockResolvedValueOnce("2026-08-12T09:00:00.000Z")
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")

    const result = await appointmentScheduling({
      ...baseProps,
      step: checkAvailabilityFromCustomFieldStep,
    } as never)

    expect(result).toEqual({
      status: "error",
      errorMessage: "invalidAvailabilityRange",
      result: null,
    })
    expect(checkAvailability).not.toHaveBeenCalled()
    expect(setValueByKey).not.toHaveBeenCalled()
  })

  test("checkAvailabilityFromCustomField: returns error when a field is empty", async () => {
    findValue.mockResolvedValueOnce(null)
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")

    const result = await appointmentScheduling({
      ...baseProps,
      step: checkAvailabilityFromCustomFieldStep,
    } as never)

    expect(result).toEqual({
      status: "error",
      errorMessage: "invalidAvailabilityRange",
      result: null,
    })
  })

  test("checkAvailabilityFromCustomField: returns success with 0 slots using the no-slots copy", async () => {
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")
    findValue.mockResolvedValueOnce("2026-08-11T09:00:00.000Z")
    checkAvailability.mockResolvedValueOnce({ text: "", slots: [] })

    const result = await appointmentScheduling({
      ...baseProps,
      step: checkAvailabilityFromCustomFieldStep,
    } as never)

    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "output-field",
      value: "Không có lịch trống.",
    })
    expect(result).toEqual({
      status: "success",
      result: { text: "Không có lịch trống.", slots: [] },
    })
    expect(setValues).not.toHaveBeenCalled()
  })

  test("checkAvailabilityFromCustomField: writes availability text and succeeds", async () => {
    findValue.mockResolvedValueOnce("2026-08-10T09:00:00.000Z")
    findValue.mockResolvedValueOnce("2026-08-11T09:00:00.000Z")

    const result = await appointmentScheduling({
      ...baseProps,
      step: checkAvailabilityFromCustomFieldStep,
    } as never)

    expect(checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
      }),
    )
    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "output-field",
      value: "Available: Aug 10, 9:00 AM",
    })
    expect(result.status).toBe("success")
  })
})
