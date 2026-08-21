// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findCalendarByOrFail: vi.fn(),
  resolveAvailableSlotsForListing: vi.fn(),
  verifyAppointmentWebviewToken: vi.fn(),
  dateRangePicker: vi.fn(() => null),
  dateTimePicker: vi.fn(() => null),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("next/script", () => ({
  default: () => null,
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: {
    findByOrFail: mocks.findCalendarByOrFail,
    resolveAvailableSlotsForListing: mocks.resolveAvailableSlotsForListing,
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  verifyAppointmentWebviewToken: mocks.verifyAppointmentWebviewToken,
}))

vi.mock("@/features/booking-webview/components/date-time-picker", () => ({
  DateTimePicker: mocks.dateTimePicker,
}))

vi.mock("@/features/booking-webview/components/date-range-picker", () => ({
  DateRangePicker: mocks.dateRangePicker,
}))

const { default: BookingPickerPage } = await import(
  "../src/app/booking/picker/page"
)
const { default: BookingRangePickerPage } = await import(
  "../src/app/booking/range-picker/page"
)

describe("booking webview pages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "calendar-1",
      name: "Demo Calendar",
      description: "Demo description",
      timezone: "UTC",
    })
    mocks.resolveAvailableSlotsForListing.mockResolvedValue([
      {
        startAt: new Date("2026-08-10T09:00:00.000Z"),
        endAt: new Date("2026-08-10T09:30:00.000Z"),
      },
    ])
  })

  test("uses availabilityStartAt and availabilityEndAt when listing booking slots", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "book",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      nodeId: "node-1",
      availabilityStartAt: "2026-08-10T00:00:00.000Z",
      availabilityEndAt: "2026-08-12T23:59:59.999Z",
    })

    await BookingPickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(mocks.resolveAvailableSlotsForListing).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      endDate: new Date("2026-08-12T23:59:59.999Z"),
    })
  })

  test("does not render booking picker for availability range tokens", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
    })

    await BookingPickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(mocks.resolveAvailableSlotsForListing).not.toHaveBeenCalled()
    expect(mocks.dateTimePicker).not.toHaveBeenCalled()
  })

  test("renders range picker for range tokens", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
    })

    await BookingRangePickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(mocks.findCalendarByOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "calendar-1",
    })
  })

  test("does not render range picker for invalid tokens", async () => {
    mocks.verifyAppointmentWebviewToken.mockRejectedValue(new Error("expired"))

    await BookingRangePickerPage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(mocks.findCalendarByOrFail).not.toHaveBeenCalled()
    expect(mocks.dateRangePicker).not.toHaveBeenCalled()
  })
})
