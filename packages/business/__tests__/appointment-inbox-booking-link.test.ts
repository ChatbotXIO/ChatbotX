import { verifyAppointmentWebviewToken } from "@chatbotx.io/encryption"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findCalendarByOrFail: vi.fn(),
  createOutgoing: vi.fn(),
}))

vi.mock("../src/appointment-calendar", () => ({
  appointmentCalendarService: { findByOrFail: mocks.findCalendarByOrFail },
}))

vi.mock("../src/message/service", () => ({
  messageService: { createOutgoing: mocks.createOutgoing },
}))

vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

const { ChatbotXException, notFoundException } = await import("../src/errors")
const { createInboxBookingLink, sendInboxBookingLink } = await import(
  "../src/appointment/inbox-booking-link"
)

const LONG_ID = "1234567890123456789"
const PICKER_URL_RE = /\/booking\/picker\?token=/
const ONE_DAY_MS = 24 * 60 * 60 * 1000

const conversation = {
  id: LONG_ID,
  contactId: "1234567890123456781",
  workspaceId: "1234567890123456782",
} as never
const contactInbox = {
  id: "1234567890123456783",
  inboxId: "1234567890123456784",
  language: "en",
} as never

const baseInput = {
  workspaceId: "1234567890123456782",
  conversation,
  contactInbox,
  calendarId: "1234567890123456785",
  appUrl: "https://app.chatbotx.io",
}

const tokenFrom = (url: string) => new URL(url).searchParams.get("token") ?? ""

describe("createInboxBookingLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "1234567890123456785",
      name: "Consultation",
      active: true,
    })
    mocks.createOutgoing.mockResolvedValue({ id: "message-1" })
  })

  test("rejects inactive calendars", async () => {
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "1234567890123456785",
      name: "Consultation",
      active: false,
    })

    const error = await createInboxBookingLink(baseInput).catch((e) => e)

    expect(error).toBeInstanceOf(ChatbotXException)
    expect(error.code).toBe("appointmentCalendarInactive")
    expect(error.httpStatusCode).toBe(409)
  })

  test("propagates not found for a calendar of another workspace", async () => {
    mocks.findCalendarByOrFail.mockRejectedValue(
      notFoundException("Appointment calendar not found"),
    )

    await expect(createInboxBookingLink(baseInput)).rejects.toMatchObject({
      code: "notFound",
    })
    expect(mocks.findCalendarByOrFail).toHaveBeenCalledWith({
      workspaceId: baseInput.workspaceId,
      id: baseInput.calendarId,
    })
  })

  test("signs an inbox picker token for the conversation contact", async () => {
    const before = Date.now()
    const link = await createInboxBookingLink(baseInput)

    expect(link.url).toMatch(PICKER_URL_RE)
    expect(link.calendar).toEqual({
      id: "1234567890123456785",
      name: "Consultation",
    })
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ONE_DAY_MS)
    // A short prompt with a URL button, like the flow step's booking message.
    expect(link.content).toEqual({
      text: "Choose an appointment time",
      button: {
        id: expect.any(String),
        label: "Select Date",
        buttonType: "url",
        url: link.url,
        messengerExtensions: true,
      },
    })

    const payload = await verifyAppointmentWebviewToken(tokenFrom(link.url))
    expect(payload).toMatchObject({
      source: "inbox",
      mode: "book",
      workspaceId: baseInput.workspaceId,
      calendarId: baseInput.calendarId,
      contactId: "1234567890123456781",
      conversationId: LONG_ID,
      contactInboxId: "1234567890123456783",
    })
    expect(payload).not.toHaveProperty("channel")
    expect(payload).not.toHaveProperty("nodeId")
  })

  test("uses Vietnamese copy for Vietnamese contacts", async () => {
    const link = await createInboxBookingLink({
      ...baseInput,
      contactInbox: { ...(contactInbox as object), language: "vi" } as never,
    })

    expect(link.content.text).toBe("Chọn thời gian đặt lịch")
    expect(link.content.button.label).toBe("Chọn ngày")
  })

  test("keeps the link within channel limits for long ids and a white-label domain", async () => {
    const link = await createInboxBookingLink({
      ...baseInput,
      // 40 characters
      appUrl: "https://booking.white-label-example.io",
      contactInbox: { ...(contactInbox as object), language: "vi" } as never,
    })

    // Within the URL-button limits of the strictest channels.
    expect(link.url.length).toBeLessThanOrEqual(900)
  })
})

describe("sendInboxBookingLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCalendarByOrFail.mockResolvedValue({
      id: "1234567890123456785",
      name: "Consultation",
      active: true,
    })
    mocks.createOutgoing.mockResolvedValue({ id: "message-1" })
  })

  test("sends a prompt with a URL button as an agent message on the contact inbox", async () => {
    const result = await sendInboxBookingLink({
      ...baseInput,
      user: { id: "user-1" },
      bypassThreadControlLock: true,
    })

    const button = result.content.button
    expect(button).toMatchObject({ buttonType: "url", url: result.url })
    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      input: {
        text: "Choose an appointment time",
        inboxId: "1234567890123456784",
        bypassThreadControlLock: true,
        contentAttributes: {
          type: "template",
          payload: { templateType: "button", buttons: [button] },
        },
        quickReplies: [button],
      },
      user: { id: "user-1" },
    })
    // The long tokenised URL never goes out as message text.
    expect(mocks.createOutgoing.mock.calls[0]?.[0].input.text).not.toContain(
      "/booking/picker",
    )
    expect(result.message).toEqual({ id: "message-1" })
  })

  test("sends even for a long white-label domain, since the URL rides in the button", async () => {
    await sendInboxBookingLink({
      ...baseInput,
      appUrl: `https://${"a".repeat(200)}.example.com`,
    })

    expect(mocks.createOutgoing).toHaveBeenCalled()
  })
})
