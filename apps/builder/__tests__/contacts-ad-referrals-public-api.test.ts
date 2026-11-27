import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedProcedure = {
  route: RouteConfig
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
      errors: vi.fn(() => chain),
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

const resolveContactId = vi.fn()
const listContactAdTouches = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
  listContactAdTouches,
}))

await import("@/features/contacts/api/public/ad-referrals")
const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const { listContactAdReferrals } = await import(
  "@/features/contacts/lib/list-contact-ad-referrals"
)
const { encodeCursor } = await import("@/lib/pagination/cursor-pagination")

const touch = (overrides: Record<string, unknown> = {}) => ({
  id: "9",
  channel: "messenger",
  provider: "meta",
  occurredAt: new Date("2026-10-20T08:00:00.000Z"),
  adId: "120",
  campaignId: null,
  adGroupId: null,
  source: "ADS",
  sourceUrl: "https://fb.me/ad",
  metadata: { adTitle: "Summer sale", adBody: "secret body" },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  resolveContactId.mockResolvedValue("contact-1")
})

describe("GET /v1/contacts/{identifier}/ad-referrals", () => {
  const procedure = capturedProcedures.find(
    (p) => p.route.path === "/v1/contacts/{identifier}/ad-referrals",
  )

  test("is registered under the contacts scope", () => {
    expect(procedure?.route.method).toBe("GET")
    expect(scopeArgAtImport).toBe("contacts")
  })

  test("resolves the identifier in the token's workspace, then lists that contact's touches", async () => {
    listContactAdTouches.mockResolvedValueOnce({
      data: [touch()],
      nextCursor: null,
    })

    const result = await procedure?.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "phone:+841234567890", perPage: 20 },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "phone:+841234567890",
      workspaceId: "workspace-1",
    })
    expect(listContactAdTouches).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        limit: 20,
      }),
    )
    expect(result).toEqual({
      data: [expect.objectContaining({ adId: "120", title: "Summer sale" })],
      nextCursor: null,
    })
  })
})

describe("listContactAdReferrals", () => {
  test("exposes the ad and where it came from, never the stored metadata or click ids", async () => {
    listContactAdTouches.mockResolvedValueOnce({
      data: [touch()],
      nextCursor: null,
    })

    const result = await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 20,
    })

    expect(result.data).toEqual([
      {
        id: "9",
        adId: "120",
        title: "Summer sale",
        channel: "messenger",
        provider: "meta",
        campaignId: null,
        adGroupId: null,
        source: "ADS",
        sourceUrl: "https://fb.me/ad",
        occurredAt: new Date("2026-10-20T08:00:00.000Z"),
      },
    ])
    expect(JSON.stringify(result)).not.toContain("secret body")
    expect(JSON.stringify(result)).not.toContain("clickId")
  })

  test("a touch with no headline or ad id is still listed", async () => {
    listContactAdTouches.mockResolvedValueOnce({
      data: [touch({ adId: null, metadata: null, provider: "google" })],
      nextCursor: null,
    })

    const result = await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 20,
    })

    expect(result.data[0]).toMatchObject({
      adId: null,
      title: null,
      provider: "google",
    })
  })

  test("hands the next page's cursor back as an opaque string and accepts it again", async () => {
    const occurredAt = new Date("2026-10-19T08:00:00.000Z")
    listContactAdTouches.mockResolvedValueOnce({
      data: [touch()],
      nextCursor: { occurredAt, id: "8" },
    })

    const first = await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 1,
    })
    expect(typeof first.nextCursor).toBe("string")

    listContactAdTouches.mockResolvedValueOnce({ data: [], nextCursor: null })
    await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 1,
      cursor: first.nextCursor ?? undefined,
    })

    expect(listContactAdTouches).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { occurredAt, id: "8" } }),
    )
  })

  test("a malformed cursor is a 400, not a silent restart that would repeat rows", async () => {
    await expect(
      listContactAdReferrals({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        perPage: 20,
        cursor: "not-a-cursor",
      }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(listContactAdTouches).not.toHaveBeenCalled()
  })

  test("passes the caller's access scope through, so a restricted member sees only assigned contacts", async () => {
    listContactAdTouches.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 20,
      accessScope: { restrictToAssignedUserId: "user-7" },
    })

    expect(listContactAdTouches).toHaveBeenCalledWith(
      expect.objectContaining({
        accessScope: { restrictToAssignedUserId: "user-7" },
      }),
    )
  })

  test("a cursor the encoder produced round-trips its time and id", async () => {
    const cursor = encodeCursor({
      direction: "next",
      createdAt: new Date("2026-10-19T08:00:00.000Z"),
      id: "8",
    })
    listContactAdTouches.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listContactAdReferrals({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      perPage: 20,
      cursor,
    })

    expect(listContactAdTouches).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { occurredAt: new Date("2026-10-19T08:00:00.000Z"), id: "8" },
      }),
    )
  })
})
