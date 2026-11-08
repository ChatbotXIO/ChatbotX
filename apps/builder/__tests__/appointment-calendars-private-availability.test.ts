// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type Handler = (args: {
  input: Record<string, unknown>
  context: Record<string, unknown>
}) => Promise<unknown>
type Captured = {
  route: RouteConfig
  middleware?: unknown
  mapper?: (input: { workspaceId: string }) => string
  handler?: Handler
}

const { authorizedAPI, captured, mocks, workspaceAuthorizedMidddleware } =
  vi.hoisted(() => {
    const captured: Captured[] = []
    const authorizedAPI = {
      route: vi.fn((route: RouteConfig) => {
        const record: Captured = { route }
        captured.push(record)
        const chain = {
          input: vi.fn(() => chain),
          output: vi.fn(() => chain),
          use: vi.fn(
            (middleware: unknown, mapper: Captured["mapper"]): typeof chain => {
              record.middleware = middleware
              record.mapper = mapper
              return chain
            },
          ),
          handler: vi.fn((handler: Handler) => {
            record.handler = handler
            return { handler }
          }),
        }
        return chain
      }),
    }
    return {
      authorizedAPI,
      captured,
      mocks: {
        checkAvailability: vi.fn(),
        requireContactAccessForMember: vi.fn(),
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  })

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
}))
vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService: { listForFlow: vi.fn() },
  appointmentService: { checkAvailability: mocks.checkAvailability },
}))

await import("@/features/appointment-calendars/api/private")
const { getContactAvailabilityRequest, getContactAvailabilityResponse } =
  await import("@/features/appointment-calendars/schema/query")
const { appointmentCalendarAvailabilityPublicResponse } = await import(
  "@/features/appointment-calendars/schema/public"
)

const procedure = captured.find(
  (record) =>
    record.route.path ===
    "/workspaces/{workspaceId}/appointment-calendars/{calendarId}/availability",
)

const input = {
  workspaceId: "1",
  calendarId: "2",
  contactId: "3",
  startDate: new Date("2026-11-08T00:00:00.000Z"),
  endDate: new Date("2026-12-08T00:00:00.000Z"),
}
const context = {
  workspaceMember: { permissions: { contacts: true } },
  user: { id: "user-1" },
}
const slot = {
  startAt: new Date("2026-11-10T09:00:00.000Z"),
  endAt: new Date("2026-11-10T09:30:00.000Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireContactAccessForMember.mockResolvedValue({})
  mocks.checkAvailability.mockResolvedValue({
    text: "2026-11-10 09:00",
    slots: [slot],
    timezone: "Asia/Ho_Chi_Minh",
  })
})

describe("getContactAvailabilityAPI", () => {
  test("registers a workspace-authorized GET endpoint", () => {
    expect(procedure?.route.method).toBe("GET")
    expect(procedure?.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(procedure?.mapper?.({ workspaceId: "1" })).toBe("1")
  })

  test("checks contact access, then returns the calendar timezone and slots", async () => {
    const result = await procedure?.handler?.({ input, context })

    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions: { contacts: true },
      userId: "user-1",
      workspaceId: "1",
      contactId: "3",
    })
    expect(mocks.checkAvailability).toHaveBeenCalledWith({
      workspaceId: "1",
      calendarId: "2",
      contactId: "3",
      startDate: input.startDate,
      endDate: input.endDate,
    })
    expect(result).toEqual({ timezone: "Asia/Ho_Chi_Minh", slots: [slot] })
  })

  test("refuses a contact outside the member's scope", async () => {
    mocks.requireContactAccessForMember.mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(procedure?.handler?.({ input, context })).rejects.toThrow(
      "Contact not found",
    )
    expect(mocks.checkAvailability).not.toHaveBeenCalled()
  })
})

describe("getContactAvailability schemas", () => {
  test("rejects a range over 90 days or ending before it starts", () => {
    expect(
      getContactAvailabilityRequest.safeParse({
        ...input,
        endDate: "2027-03-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
    expect(
      getContactAvailabilityRequest.safeParse({
        ...input,
        endDate: "2026-11-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
    expect(getContactAvailabilityRequest.safeParse(input).success).toBe(true)
  })

  test("keeps only timezone and slot dates in the response", () => {
    const parsed = getContactAvailabilityResponse.parse({
      text: "leaks",
      timezone: "UTC",
      slots: [{ ...slot, extra: true }],
    })

    expect(parsed).toEqual({ timezone: "UTC", slots: [slot] })
    expect(parsed.slots[0]?.startAt).toBeInstanceOf(Date)
  })

  test("refuses slots of the wrong shape", () => {
    expect(
      getContactAvailabilityResponse.safeParse({
        timezone: "UTC",
        slots: [{ startAt: slot.startAt }],
      }).success,
    ).toBe(false)
  })

  test("the public getAvailability response still drops the added timezone", () => {
    // checkAvailability now also returns `timezone` for the private API; the
    // public contract stays `{ text, slots }`.
    expect(
      appointmentCalendarAvailabilityPublicResponse.parse({
        text: "slots",
        slots: [slot],
        timezone: "UTC",
      }),
    ).toEqual({ text: "slots", slots: [slot] })
  })
})
