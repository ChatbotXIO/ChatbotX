import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  errors?: Record<string, unknown>
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn((errorMap: Record<string, unknown>) => {
        record.errors = errorMap
        return chain
      }),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const appointmentService = {
  list: vi.fn(),
  findByOrFail: vi.fn(),
  bookAppointment: vi.fn(),
  cancelAppointmentById: vi.fn(),
  deleteAppointmentById: vi.fn(),
}
const resolveTenantSettings = vi.fn()
const conversationService = { resolveContactInboxForConversation: vi.fn() }
const createInboxBookingLink = vi.fn()
const sendInboxBookingLink = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  appointmentService,
  conversationService,
  createInboxBookingLink,
  resolveTenantSettings,
  sendInboxBookingLink,
}))

const memberScope = {
  assertConversationAccessForCaller: vi.fn(),
  contactIdFor: vi.fn(),
  resolveSenderForCaller: vi.fn(),
}
vi.mock("@/lib/public-api/member-scope", () => memberScope)

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
    optional: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    appointmentModel: {},
  }
})

await import("@/features/appointments/api/public")
const { bookAppointmentPublicRequest } = await import(
  "@/features/appointments/schema/public"
)

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const ID_PREFIX_RE = /^id:/

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the appointments public router under the appointments scope", () => {
  expect(scopeArgAtImport).toBe("appointments")
})

describe("GET /v1/appointments", () => {
  const procedure = findProcedure("GET", "/v1/appointments")

  test("resolves appUrl itself and delegates to appointmentService.list without a session", async () => {
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    appointmentService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, calendarId: "cal-1", tab: "next" },
    })

    expect(resolveTenantSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(appointmentService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "cal-1",
      tab: "next",
      search: undefined,
      page: 1,
      perPage: 50,
      appUrl: "https://app.test",
    })
  })
})

describe("GET /v1/appointments/{id}", () => {
  const procedure = findProcedure("GET", "/v1/appointments/{id}")

  test("delegates to appointmentService.findByOrFail", async () => {
    appointmentService.findByOrFail.mockResolvedValueOnce({ id: "appt-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.findByOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "appt-1",
    })
  })
})

describe("POST /v1/appointments", () => {
  const procedure = findProcedure("POST", "/v1/appointments")

  beforeEach(() => {
    memberScope.contactIdFor.mockImplementation(
      async (_context: unknown, identifier: string) =>
        identifier.replace(ID_PREFIX_RE, ""),
    )
    memberScope.assertConversationAccessForCaller.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
    })
    conversationService.resolveContactInboxForConversation.mockResolvedValue({
      id: "ci-1",
      inboxId: "inbox-1",
    })
    appointmentService.bookAppointment.mockResolvedValue({ id: "appt-1" })
  })

  test("delegates to appointmentService.bookAppointment", async () => {
    const startAt = new Date("2026-01-01T10:00:00Z")
    appointmentService.bookAppointment.mockResolvedValueOnce({ id: "appt-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        calendarId: "cal-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        startAt,
        inviteeTimezone: "UTC",
      },
    })

    expect(appointmentService.bookAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "cal-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      startAt,
      inviteeTimezone: "UTC",
    })
  })

  test("books on the conversation's contact inbox when inboxId is set", async () => {
    const startAt = new Date("2026-01-01T10:00:00Z")

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        calendarId: "cal-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        inboxId: "inbox-1",
        startAt,
      },
    })

    expect(
      conversationService.resolveContactInboxForConversation,
    ).toHaveBeenCalledWith({
      conversation: { id: "conv-1", contactId: "contact-1" },
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
    })
    expect(appointmentService.bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
      }),
    )
  })

  test("resolves the bare contactId as an `id:` identifier", async () => {
    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        calendarId: "cal-1",
        contactId: "123",
        startAt: new Date("2026-01-01T10:00:00Z"),
      },
    })

    // contactIdFor rejects a bare id ("Invalid identifier format", 404).
    expect(memberScope.contactIdFor).toHaveBeenCalledWith(
      expect.anything(),
      "id:123",
    )
    expect(appointmentService.bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "123" }),
    )
  })

  test("books silently on a conversation without inboxId", async () => {
    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        calendarId: "cal-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        startAt: new Date("2026-01-01T10:00:00Z"),
      },
    })

    expect(
      conversationService.resolveContactInboxForConversation,
    ).not.toHaveBeenCalled()
    expect(
      appointmentService.bookAppointment.mock.calls[0]?.[0].contactInboxId,
    ).toBeUndefined()
  })

  test("propagates not found for a contact outside the member's scope", async () => {
    const notFound = Object.assign(new Error("Contact not found"), {
      code: "notFound",
    })
    memberScope.contactIdFor.mockRejectedValueOnce(notFound)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          calendarId: "cal-1",
          contactId: "contact-9",
          startAt: new Date("2026-01-01T10:00:00Z"),
        },
      }),
    ).rejects.toBe(notFound)
    expect(appointmentService.bookAppointment).not.toHaveBeenCalled()
  })

  test("propagates not found for a conversation outside the member's scope", async () => {
    const notFound = Object.assign(new Error("Conversation not found"), {
      code: "notFound",
    })
    memberScope.assertConversationAccessForCaller.mockRejectedValueOnce(
      notFound,
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          calendarId: "cal-1",
          contactId: "contact-1",
          conversationId: "conv-9",
          startAt: new Date("2026-01-01T10:00:00Z"),
        },
      }),
    ).rejects.toBe(notFound)
    expect(appointmentService.bookAppointment).not.toHaveBeenCalled()
  })

  describe("request schema", () => {
    const base = {
      calendarId: "1",
      contactId: "2",
      startAt: "2026-01-01T10:00:00Z",
    }

    test("requires conversationId with inboxId", () => {
      expect(
        bookAppointmentPublicRequest.safeParse({ ...base, inboxId: "3" })
          .success,
      ).toBe(false)
      expect(
        bookAppointmentPublicRequest.safeParse({
          ...base,
          conversationId: "4",
          inboxId: "3",
        }).success,
      ).toBe(true)
    })

    // The route is released: a non-IANA value used to be accepted (201), so the
    // schema stays lenient and the service falls back to the calendar timezone.
    test("keeps accepting any invitee timezone string", () => {
      for (const inviteeTimezone of [
        "Mars/Base",
        "GMT+7",
        "ICT",
        "Asia/Ho_Chi_Minh",
      ]) {
        expect(
          bookAppointmentPublicRequest.safeParse({ ...base, inviteeTimezone })
            .success,
        ).toBe(true)
      }
    })
  })

  // The workspace-scoping check for contactId/conversationId lives in
  // appointmentService.bookAppointment itself, not this handler — see
  // packages/business/__tests__/appointment-service-webview.test.ts for the
  // cross-tenant regression coverage.

  test("declares the booking 409 error codes", () => {
    expect(procedure.errors).toMatchObject({
      notFound: { status: 404 },
      slotUnavailable: { status: 409 },
      appointmentAvailabilityChanged: { status: 409 },
      appointmentAlreadyScheduled: { status: 409 },
      invalidAppointmentConversation: { status: 400 },
    })
  })
})

describe("POST /v1/appointments/{id}/cancel", () => {
  const procedure = findProcedure("POST", "/v1/appointments/{id}/cancel")

  test("delegates to appointmentService.cancelAppointmentById", async () => {
    appointmentService.cancelAppointmentById.mockResolvedValueOnce({
      id: "appt-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.cancelAppointmentById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appt-1",
    })
  })
})

describe("DELETE /v1/appointments/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/appointments/{id}")

  test("delegates to appointmentService.deleteAppointmentById", async () => {
    appointmentService.deleteAppointmentById.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.deleteAppointmentById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appt-1",
    })
  })
})

describe("POST /v1/conversations/{conversationId}/appointment-booking-link", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/conversations/{conversationId}/appointment-booking-link",
  )
  const conversation = { id: "conv-1", contactId: "contact-1" }
  const contactInbox = { id: "ci-1", inboxId: "inbox-1" }
  const link = {
    url: "https://app.test/booking/picker?token=abc",
    expiresAt: new Date("2026-11-15T00:00:00Z"),
    calendar: { id: "cal-1", name: "Consultation" },
    messageText:
      "Choose an appointment time\nhttps://app.test/booking/picker?token=abc",
  }
  const tokenContext = (scopes: string[] | null) => ({
    workspace: { id: "workspace-1" },
    apiToken: { scopes },
  })

  beforeEach(() => {
    memberScope.assertConversationAccessForCaller.mockResolvedValue(
      conversation,
    )
    conversationService.resolveContactInboxForConversation.mockResolvedValue(
      contactInbox,
    )
    resolveTenantSettings.mockResolvedValue({ appUrl: "https://app.test" })
    createInboxBookingLink.mockResolvedValue(link)
    sendInboxBookingLink.mockResolvedValue({
      ...link,
      message: { id: "msg-1" },
    })
  })

  test("returns 201 with the link without sending", async () => {
    expect(procedure.route.successStatus).toBe(201)

    const result = await procedure.handler?.({
      context: tokenContext(["appointments"]),
      input: { conversationId: "conv-1", calendarId: "cal-1", send: false },
    })

    expect(memberScope.assertConversationAccessForCaller).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: { id: "workspace-1" } }),
      "conv-1",
    )
    expect(
      conversationService.resolveContactInboxForConversation,
    ).toHaveBeenCalledWith({
      conversation,
      workspaceId: "workspace-1",
      inboxId: undefined,
    })
    expect(createInboxBookingLink).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversation,
      contactInbox,
      calendarId: "cal-1",
      appUrl: "https://app.test",
    })
    expect(sendInboxBookingLink).not.toHaveBeenCalled()
    expect(result).toEqual({
      url: link.url,
      expiresAt: link.expiresAt,
      calendar: link.calendar,
      messageId: null,
    })
  })

  test("sends the link with send=true", async () => {
    memberScope.resolveSenderForCaller.mockReturnValue({ id: "user-1" })

    const result = await procedure.handler?.({
      context: tokenContext(null),
      input: {
        conversationId: "conv-1",
        calendarId: "cal-1",
        inboxId: "inbox-1",
        send: true,
        bypassThreadControlLock: true,
      },
    })

    expect(sendInboxBookingLink).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversation,
      contactInbox,
      calendarId: "cal-1",
      appUrl: "https://app.test",
      user: { id: "user-1" },
      bypassThreadControlLock: true,
    })
    expect(createInboxBookingLink).not.toHaveBeenCalled()
    expect(result).toMatchObject({ messageId: "msg-1" })
  })

  test("send=true with an appointments-only token is forbidden before any lookup", async () => {
    await expect(
      procedure.handler?.({
        context: tokenContext(["appointments"]),
        input: { conversationId: "conv-1", calendarId: "cal-1", send: true },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
    expect(memberScope.assertConversationAccessForCaller).not.toHaveBeenCalled()
    expect(sendInboxBookingLink).not.toHaveBeenCalled()
  })

  test("send=true with appointments and inbox scopes is allowed", async () => {
    await expect(
      procedure.handler?.({
        context: tokenContext(["appointments", "inbox"]),
        input: { conversationId: "conv-1", calendarId: "cal-1", send: true },
      }),
    ).resolves.toMatchObject({ messageId: "msg-1" })
  })

  test("propagates not found for a conversation outside the caller's scope", async () => {
    const notFound = Object.assign(new Error("Conversation not found"), {
      code: "notFound",
    })
    memberScope.assertConversationAccessForCaller.mockRejectedValue(notFound)

    await expect(
      procedure.handler?.({
        context: tokenContext(["appointments"]),
        input: { conversationId: "conv-2", calendarId: "cal-1", send: false },
      }),
    ).rejects.toBe(notFound)
    expect(createInboxBookingLink).not.toHaveBeenCalled()
  })

  test("propagates an inactive calendar", async () => {
    const inactive = Object.assign(new Error("inactive"), {
      code: "appointmentCalendarInactive",
    })
    createInboxBookingLink.mockRejectedValue(inactive)

    await expect(
      procedure.handler?.({
        context: tokenContext(["appointments"]),
        input: { conversationId: "conv-1", calendarId: "cal-1", send: false },
      }),
    ).rejects.toBe(inactive)
  })

  test("declares the booking link error codes", () => {
    expect(procedure.errors).toMatchObject({
      notFound: { status: 404 },
      appointmentCalendarInactive: { status: 409 },
      idempotencyKeyConflict: { status: 409 },
    })
  })
})
