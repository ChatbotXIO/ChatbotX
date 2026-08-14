// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

class SlotUnavailableException extends Error {}
class AppointmentAvailabilityChangedException extends Error {}
class AppointmentAlreadyScheduledException extends Error {}

const RANGE_TOKENS_ERROR_RE = /range tokens/

const mocks = vi.hoisted(() => ({
  completeWebviewBooking: vi.fn(),
  getOriginFromHeader: vi.fn(),
  integrationQueueAdd: vi.fn(),
  resolveAvailableSlotsForListing: vi.fn(),
  setValueByKey: vi.fn(),
  verifyAppointmentWebviewToken: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)
  return { actionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    resolveAvailableSlotsForListing: mocks.resolveAvailableSlotsForListing,
  },
  appointmentService: {
    completeWebviewBooking: mocks.completeWebviewBooking,
  },
  contactCustomFieldService: {
    setValueByKey: mocks.setValueByKey,
  },
  AppointmentAvailabilityChangedException,
  AppointmentAlreadyScheduledException,
  SlotUnavailableException,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  verifyAppointmentWebviewToken: mocks.verifyAppointmentWebviewToken,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE: "appointmentWebviewSelection",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))

vi.mock("@/lib/domain", () => ({
  getOriginFromHeader: mocks.getOriginFromHeader,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

const { submitBooking } = await import(
  "../src/app/booking/picker/actions/submit-booking.action"
)

describe("submitBookingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "book",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      nodeId: "node-1",
      stepId: "step-1",
      selectedDateCustomFieldId: "bookingDate",
    })
    mocks.getOriginFromHeader.mockResolvedValue("https://app.example.test")
    mocks.completeWebviewBooking.mockResolvedValue({
      appointment: { id: "appointment-1" },
      scheduleUrl: "https://app.example.test/schedule/appointment-1",
      cancelUrl: "https://app.example.test/cancel/appointment-1",
    })
    mocks.resolveAvailableSlotsForListing.mockResolvedValue([
      {
        startAt: new Date("2026-08-15T09:00:00.000Z"),
        endAt: new Date("2026-08-15T09:30:00.000Z"),
      },
    ])
    mocks.setValueByKey.mockResolvedValue(undefined)
    mocks.integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("keeps a committed booking successful when post-commit side effects fail", async () => {
    mocks.setValueByKey.mockRejectedValue(new Error("custom field down"))
    mocks.integrationQueueAdd.mockRejectedValue(new Error("queue down"))

    const result = await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(result).toEqual(
      expect.objectContaining({
        completed: true,
        staleSlot: false,
        appointment: { id: "appointment-1" },
      }),
    )
  })

  test("forwards appointment id to the resumed flow job and metadata", async () => {
    await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: expect.objectContaining({
        appointmentId: "appointment-1",
        metadata: expect.objectContaining({
          appointmentId: "appointment-1",
        }),
      }),
    })
  })

  test("still returns staleSlot for actual slot conflicts", async () => {
    mocks.completeWebviewBooking.mockRejectedValue(
      new SlotUnavailableException(),
    )

    const result = await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(result).toEqual({
      staleSlot: true,
      availabilityChanged: false,
      completed: false,
      appointment: null,
      scheduleUrl: null,
      cancelUrl: null,
    })
  })

  test("returns staleSlot when the contact already has a scheduled appointment", async () => {
    mocks.completeWebviewBooking.mockRejectedValue(
      new AppointmentAlreadyScheduledException(),
    )

    const result = await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(result).toEqual({
      staleSlot: true,
      availabilityChanged: false,
      completed: false,
      appointment: null,
      scheduleUrl: null,
      cancelUrl: null,
    })
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("returns availabilityChanged for stale availability fingerprints", async () => {
    mocks.completeWebviewBooking.mockRejectedValue(
      new AppointmentAvailabilityChangedException(),
    )

    const result = await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(result).toEqual({
      staleSlot: false,
      availabilityChanged: true,
      completed: false,
      appointment: null,
      scheduleUrl: null,
      cancelUrl: null,
    })
  })

  test("uses listing availability resolver for select-availability submissions", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "selectAvailability",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      nodeId: "node-1",
      stepId: "step-1",
      availabilityStartAt: "2026-08-15T00:00:00.000Z",
      availabilityEndAt: "2026-08-15T23:59:59.999Z",
    })

    await submitBooking({
      token: "token-1",
      selectedStartAt: "2026-08-15T09:00:00.000Z",
      inviteeTimezone: "UTC",
    })

    expect(mocks.resolveAvailableSlotsForListing).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      startDate: new Date("2026-08-15T00:00:00.000Z"),
      endDate: new Date("2026-08-15T23:59:59.999Z"),
    })
    expect(mocks.completeWebviewBooking).not.toHaveBeenCalled()
  })

  test("rejects availability range tokens", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      nodeId: "node-1",
      stepId: "step-1",
    })

    await expect(
      submitBooking({
        token: "token-1",
        selectedStartAt: "2026-08-15T09:00:00.000Z",
        inviteeTimezone: "UTC",
      }),
    ).rejects.toThrow(RANGE_TOKENS_ERROR_RE)
    expect(mocks.completeWebviewBooking).not.toHaveBeenCalled()
    expect(mocks.resolveAvailableSlotsForListing).not.toHaveBeenCalled()
  })
})
