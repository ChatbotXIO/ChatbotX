// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

class SlotUnavailableException extends Error {}
class AppointmentAvailabilityChangedException extends Error {}
class AppointmentAlreadyScheduledException extends Error {}

const mocks = vi.hoisted(() => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = vi.fn(() => chain)
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)

  return {
    chain,
    bookAppointment: vi.fn(),
    resolveContactInboxForConversation: vi.fn(),
    resolveTenantSettings: vi.fn(),
    createInboxBookingLink: vi.fn(),
    sendInboxBookingLink: vi.fn(),
    assertConversationAccessForCaller: vi.fn(),
    requireContactAccessForMember: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => ({ workspaceActionClient: mocks.chain }))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: { bookAppointment: mocks.bookAppointment },
  conversationService: {
    resolveContactInboxForConversation:
      mocks.resolveContactInboxForConversation,
  },
  resolveTenantSettings: mocks.resolveTenantSettings,
  createInboxBookingLink: mocks.createInboxBookingLink,
  sendInboxBookingLink: mocks.sendInboxBookingLink,
  SlotUnavailableException,
  AppointmentAvailabilityChangedException,
  AppointmentAlreadyScheduledException,
}))

vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: mocks.assertConversationAccessForCaller,
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
}))

const { createInboxBookingLinkAction } = await import(
  "../src/features/appointment-management/actions/create-inbox-booking-link.action"
)
const { bookContactAppointmentAction } = await import(
  "../src/features/appointment-management/actions/book-contact-appointment.action"
)
const { bookContactAppointmentRequest } = await import(
  "../src/features/appointment-management/schema/action"
)

type Handler = (args: {
  bindArgsParsedInputs: string[]
  parsedInput: Record<string, unknown>
  ctx: Record<string, unknown>
}) => Promise<unknown>

const callLinkAction = createInboxBookingLinkAction as unknown as Handler
const callBookAction = bookContactAppointmentAction as unknown as Handler

const member = {
  userId: "user-1",
  permissions: { contacts: { onlyAssignedContacts: true } },
}
const ctx = {
  workspace: { id: "ws-1" },
  workspaceMember: member,
  workspaceMemberPermissions: member.permissions,
  user: { id: "user-1" },
}
const conversation = { id: "conv-1", contactId: "contact-1" }
const contactInbox = { id: "ci-1", inboxId: "inbox-1" }
const notFound = Object.assign(new Error("Conversation not found"), {
  code: "notFound",
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertConversationAccessForCaller.mockResolvedValue(conversation)
  mocks.resolveContactInboxForConversation.mockResolvedValue(contactInbox)
  mocks.resolveTenantSettings.mockResolvedValue({ appUrl: "https://app.test" })
  mocks.requireContactAccessForMember.mockResolvedValue({})
  mocks.bookAppointment.mockResolvedValue({ id: "appt-1" })
  const link = {
    url: "https://app.test/booking/picker?token=t",
    expiresAt: new Date("2026-11-15T00:00:00Z"),
    calendar: { id: "cal-1", name: "Consultation" },
    messageText: "text",
  }
  mocks.createInboxBookingLink.mockResolvedValue(link)
  mocks.sendInboxBookingLink.mockResolvedValue({
    ...link,
    message: { id: "msg-1" },
  })
})

describe("createInboxBookingLinkAction", () => {
  test("applies the member's conversation scope before creating a link", async () => {
    const result = await callLinkAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { calendarId: "cal-1", inboxId: "inbox-1", send: false },
      ctx,
    })

    expect(mocks.assertConversationAccessForCaller).toHaveBeenCalledWith(
      { workspace: ctx.workspace, member, user: ctx.user },
      "conv-1",
    )
    expect(mocks.createInboxBookingLink).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      contactInbox,
      calendarId: "cal-1",
      appUrl: "https://app.test",
    })
    expect(result).toMatchObject({ messageId: null })
  })

  test("sends the link as the agent", async () => {
    const result = await callLinkAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: {
        calendarId: "cal-1",
        send: true,
        bypassThreadControlLock: true,
      },
      ctx,
    })

    expect(mocks.sendInboxBookingLink).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: "user-1" },
        bypassThreadControlLock: true,
      }),
    )
    expect(result).toMatchObject({ messageId: "msg-1" })
  })

  test("refuses a conversation outside the member's scope", async () => {
    mocks.assertConversationAccessForCaller.mockRejectedValueOnce(notFound)

    await expect(
      callLinkAction({
        bindArgsParsedInputs: ["ws-1", "conv-2"],
        parsedInput: { calendarId: "cal-1", send: true },
        ctx,
      }),
    ).rejects.toBe(notFound)
    expect(mocks.sendInboxBookingLink).not.toHaveBeenCalled()
    expect(mocks.createInboxBookingLink).not.toHaveBeenCalled()
  })
})

describe("bookContactAppointmentAction", () => {
  const input = {
    calendarId: "cal-1",
    contactId: "contact-1",
    startAt: "2026-11-10T10:00:00.000Z",
    inviteeTimezone: "Asia/Ho_Chi_Minh",
  }
  const book = (parsedInput: Record<string, unknown>) =>
    callBookAction({ bindArgsParsedInputs: ["ws-1"], parsedInput, ctx })

  test("books on the contact's most recently active inbox", async () => {
    const result = await book({ ...input, conversationId: "conv-1" })

    // No `inboxId`: the server picks the inbox a plain composer reply would
    // use, never an arbitrary `conversation.contactInboxes` entry.
    expect(mocks.resolveContactInboxForConversation).toHaveBeenCalledWith({
      conversation: expect.objectContaining({ id: "conv-1" }),
      workspaceId: "ws-1",
    })

    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions: member.permissions,
      userId: "user-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mocks.bookAppointment).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      calendarId: "cal-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      startAt: new Date("2026-11-10T10:00:00.000Z"),
      inviteeTimezone: "Asia/Ho_Chi_Minh",
    })
    expect(result).toEqual({
      appointment: { id: "appt-1" },
      completed: true,
      staleSlot: false,
      availabilityChanged: false,
      alreadyScheduled: false,
    })
  })

  test("books silently without a conversation", async () => {
    await book(input)

    expect(mocks.assertConversationAccessForCaller).not.toHaveBeenCalled()
    expect(mocks.bookAppointment.mock.calls[0]?.[0]).toMatchObject({
      conversationId: undefined,
      contactInboxId: undefined,
    })
  })

  test("refuses when the contact has no inbox left to notify", async () => {
    mocks.resolveContactInboxForConversation.mockRejectedValueOnce(notFound)

    await expect(book({ ...input, conversationId: "conv-1" })).rejects.toBe(
      notFound,
    )
    expect(mocks.bookAppointment).not.toHaveBeenCalled()
  })

  test.each([
    ["slot taken", new SlotUnavailableException(), { staleSlot: true }],
    [
      "same contact already booked that start",
      new AppointmentAlreadyScheduledException(),
      { alreadyScheduled: true, staleSlot: false },
    ],
    [
      "availability changed",
      new AppointmentAvailabilityChangedException(),
      { availabilityChanged: true },
    ],
  ])("maps %s like the webview", async (_label, error, expected) => {
    mocks.bookAppointment.mockRejectedValueOnce(error)

    await expect(book(input)).resolves.toMatchObject({
      appointment: null,
      completed: false,
      ...expected,
    })
  })

  test("refuses a contact outside the member's scope", async () => {
    mocks.requireContactAccessForMember.mockRejectedValueOnce(notFound)

    await expect(book(input)).rejects.toBe(notFound)
    expect(mocks.bookAppointment).not.toHaveBeenCalled()
  })

  test("refuses a conversation the member is not assigned to", async () => {
    mocks.assertConversationAccessForCaller.mockRejectedValueOnce(notFound)

    await expect(book({ ...input, conversationId: "conv-2" })).rejects.toBe(
      notFound,
    )
    expect(mocks.bookAppointment).not.toHaveBeenCalled()
  })

  describe("input schema", () => {
    test("rejects a non-IANA invitee timezone", () => {
      expect(
        bookContactAppointmentRequest.safeParse({
          ...input,
          calendarId: "1",
          contactId: "2",
          inviteeTimezone: "Mars/Base",
        }).success,
      ).toBe(false)
      expect(
        bookContactAppointmentRequest.safeParse({
          ...input,
          calendarId: "1",
          contactId: "2",
        }).success,
      ).toBe(true)
    })
  })
})
