import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const resolveContactId = vi.fn()
const listContactBroadcasts = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
  listContactBroadcasts,
}))

await import("@/features/contacts/api/public/broadcasts")
const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const { listContactBroadcastsPage } = await import(
  "@/features/contacts/lib/list-contact-broadcasts"
)
const { encodeCursor } = await import("@/lib/pagination/cursor-pagination")

const at = (iso: string): Date => new Date(iso)

const row = (overrides: Record<string, unknown> = {}) => ({
  broadcastId: "9",
  name: "Black Friday",
  status: "sent",
  channel: "messenger",
  schedulesAt: at("2026-10-20T08:00:00.000Z"),
  sent: true,
  deliveredAt: null,
  seenAt: null,
  clickedAt: null,
  failedAt: null,
  ...overrides,
})

const listPage = (overrides: Record<string, unknown> = {}) =>
  listContactBroadcastsPage({
    workspaceId: "workspace-1",
    contactId: "contact-1",
    perPage: 20,
    ...overrides,
  })

beforeEach(() => {
  vi.clearAllMocks()
  resolveContactId.mockResolvedValue("contact-1")
})

describe("GET /v1/contacts/{identifier}/broadcasts", () => {
  const procedure = capturedProcedures.find(
    (p) => p.route.path === "/v1/contacts/{identifier}/broadcasts",
  )

  test("is registered under the contacts scope", () => {
    expect(procedure?.route.method).toBe("GET")
    expect(scopeArgAtImport).toBe("contacts")
  })

  test("resolves the identifier in the token's workspace, then lists that contact's broadcasts", async () => {
    listContactBroadcasts.mockResolvedValueOnce({
      data: [row()],
      nextCursor: null,
    })

    const result = await procedure?.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "phone:+841234567890", perPage: 20, search: "55" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "phone:+841234567890",
      workspaceId: "workspace-1",
    })
    expect(listContactBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        limit: 20,
        search: "55",
      }),
    )
    expect(result).toEqual({
      data: [
        expect.objectContaining({ broadcastId: "9", name: "Black Friday" }),
      ],
      nextCursor: null,
    })
  })
})

describe("listContactBroadcastsPage", () => {
  test("exposes the broadcast and how far it got for this contact", async () => {
    listContactBroadcasts.mockResolvedValueOnce({
      data: [row({ deliveredAt: at("2026-10-20T08:01:00.000Z") })],
      nextCursor: null,
    })

    const result = await listPage()

    expect(result.data).toEqual([
      {
        broadcastId: "9",
        name: "Black Friday",
        broadcastStatus: "sent",
        channel: "messenger",
        scheduledAt: at("2026-10-20T08:00:00.000Z"),
        recipientStatus: "delivered",
        deliveredAt: at("2026-10-20T08:01:00.000Z"),
        seenAt: null,
        clickedAt: null,
        failedAt: null,
      },
    ])
  })

  test.each([
    ["a row handed to the channel with no receipt", {}, "sent"],
    [
      "a delivered row",
      { deliveredAt: at("2026-10-20T08:01:00Z") },
      "delivered",
    ],
    [
      "a seen row",
      {
        deliveredAt: at("2026-10-20T08:01:00Z"),
        seenAt: at("2026-10-20T08:02:00Z"),
      },
      "seen",
    ],
    [
      "a clicked row (clicked was also seen)",
      {
        seenAt: at("2026-10-20T08:02:00Z"),
        clickedAt: at("2026-10-20T08:03:00Z"),
      },
      "clicked",
    ],
    [
      "a failed row, whatever else was recorded",
      { sent: false, failedAt: at("2026-10-20T08:04:00Z") },
      "failed",
    ],
  ])("%s is %s", async (_label, overrides, expected) => {
    listContactBroadcasts.mockResolvedValueOnce({
      data: [row(overrides)],
      nextCursor: null,
    })

    const result = await listPage()

    expect(result.data[0]?.recipientStatus).toBe(expected)
  })

  test("hands the next page's cursor back as an opaque string and accepts it again", async () => {
    const schedulesAt = at("2026-10-19T08:00:00.000Z")
    listContactBroadcasts.mockResolvedValueOnce({
      data: [row()],
      nextCursor: { schedulesAt, broadcastId: "8" },
    })

    const first = await listPage({ perPage: 1 })
    expect(typeof first.nextCursor).toBe("string")

    listContactBroadcasts.mockResolvedValueOnce({ data: [], nextCursor: null })
    await listPage({ perPage: 1, cursor: first.nextCursor ?? undefined })

    expect(listContactBroadcasts).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { schedulesAt, broadcastId: "8" } }),
    )
  })

  test("a malformed cursor is a 400, not a silent restart that would repeat rows", async () => {
    await expect(listPage({ cursor: "not-a-cursor" })).rejects.toMatchObject({
      code: "invalidCursor",
      httpStatusCode: 400,
    })
    expect(listContactBroadcasts).not.toHaveBeenCalled()
  })

  test("passes the search text through to the read", async () => {
    listContactBroadcasts.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listPage({ search: "black" })

    expect(listContactBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({ search: "black" }),
    )
  })

  test.each([
    [
      "an id past the bigint range",
      "9223372036854775808",
      "2026-10-19T08:00:00.000Z",
    ],
    ["a zero id", "0", "2026-10-19T08:00:00.000Z"],
    ["a time before Postgres can store", "8", "-010000-01-01T00:00:00.000Z"],
    ["a time past year 9999", "8", "+010000-01-01T00:00:00.000Z"],
  ])("a cursor with %s is a 400, not a SQL failure", async (_label, id, time) => {
    const cursor = encodeCursor({
      direction: "next",
      createdAt: at(time),
      id,
    })

    await expect(listPage({ cursor })).rejects.toMatchObject({
      code: "invalidCursor",
      httpStatusCode: 400,
    })
    expect(listContactBroadcasts).not.toHaveBeenCalled()
  })

  test("passes the caller's access scope through, so a restricted member sees only assigned contacts", async () => {
    listContactBroadcasts.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listPage({ accessScope: { restrictToAssignedUserId: "user-7" } })

    expect(listContactBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({
        accessScope: { restrictToAssignedUserId: "user-7" },
      }),
    )
  })

  test("a cursor the encoder produced round-trips its time and id", async () => {
    const cursor = encodeCursor({
      direction: "next",
      createdAt: at("2026-10-19T08:00:00.000Z"),
      id: "8",
    })
    listContactBroadcasts.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listPage({ cursor })

    expect(listContactBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: {
          schedulesAt: at("2026-10-19T08:00:00.000Z"),
          broadcastId: "8",
        },
      }),
    )
  })
})
