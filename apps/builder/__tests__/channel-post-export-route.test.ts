// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertNotBlocked: vi.fn(),
  build: vi.fn(),
  canView: vi.fn(),
  requireWorkspacePermission: vi.fn(),
}))

class FakeChatbotXException extends Error {
  code: string
  httpStatusCode: number
  constructor(message: string, code: string, httpStatusCode: number) {
    super(message)
    this.code = code
    this.httpStatusCode = httpStatusCode
  }
}

vi.mock("@chatbotx.io/business", () => ({
  MAX_BULK_UPDATE_POSTS: 100,
  MAX_TOPICS_PER_POST: 20,
  MAX_EXPORT_POST_ROWS: 5000,
  MAX_EXPORT_ROWS: 20_000,
  MAX_MERGE_VIEW_POSTS: 20,
  channelPostExportKinds: ["comments", "phones", "rows"],
  channelPostExportService: { build: mocks.build },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))
vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mocks.requireWorkspacePermission,
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: mocks.assertNotBlocked,
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found")
  },
}))
vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: mocks.canView,
}))

const { GET } = await import(
  "../src/app/space/[workspaceId]/posts/export/route"
)

const callRoute = (query: string, headers: Record<string, string> = {}) =>
  GET(
    new Request(`http://localhost/space/ws-1/posts/export?${query}`, {
      headers: { "sec-fetch-site": "same-origin", ...headers },
    }),
    { params: Promise.resolve({ workspaceId: "ws-1" }) },
  )

const file = {
  csv: 'createdAt,post\n"2026-11-22T10:00:00.000Z","Sale"\n',
  fileName: "post-comments-2026-11-23.csv",
  rowCount: 1,
  truncated: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireWorkspacePermission.mockResolvedValue({
    targetWorkspace: { ownerId: "owner-1" },
    targetWorkspaceMember: { permissions: { emailAndPhone: true } },
  })
  mocks.assertNotBlocked.mockResolvedValue(undefined)
  mocks.canView.mockReturnValue(true)
  mocks.build.mockResolvedValue(file)
})

describe("posts export route", () => {
  const crossSiteHeaders: Record<string, string>[] = [
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "", origin: "https://evil.example" },
  ]

  test.each(
    crossSiteHeaders,
  )("refuses a request from another site (%o) before reading or charging anything", async (headers) => {
    const response = await callRoute("kind=comments&postId=1", headers)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: "crossSiteRequest" })
    expect(mocks.requireWorkspacePermission).not.toHaveBeenCalled()
    expect(mocks.assertNotBlocked).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })

  test("serves a same-origin request identified by Origin when Sec-Fetch-Site is absent", async () => {
    const response = await callRoute("kind=comments&postId=1", {
      "sec-fetch-site": "",
      "x-forwarded-host": "localhost",
      origin: "http://localhost",
    })

    expect(response.status).toBe(200)
  })

  test("guards the workspace with the broadcast page permission before reading anything", async () => {
    mocks.requireWorkspacePermission.mockRejectedValue(new Error("not found"))

    await expect(callRoute("kind=comments&postId=1")).rejects.toThrow(
      "not found",
    )

    expect(mocks.requireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "broadcast",
    )
    expect(mocks.build).not.toHaveBeenCalled()
  })

  test.each([
    "postId=1",
    "kind=emails&postId=1",
    "kind=comments",
    "kind=comments&postId=abc",
    `kind=comments&${Array.from({ length: 21 }, (_, index) => `postId=${index + 1}`).join("&")}`,
  ])("rejects an invalid query (%s) without building a file", async (query) => {
    const response = await callRoute(query)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ code: "invalidRequest" })
    expect(mocks.build).not.toHaveBeenCalled()
  })

  test("collects every repeated postId and the member's phone permission", async () => {
    mocks.canView.mockReturnValue(false)

    await callRoute("kind=comments&postId=1&postId=2&search=call")

    expect(mocks.canView).toHaveBeenCalledWith({ emailAndPhone: true })
    expect(mocks.build).toHaveBeenCalledWith({
      canViewEmailAndPhone: false,
      // Omitted filters stay omitted: the comment kinds refuse any filters.
      filters: undefined,
      kind: "comments",
      postIds: ["1", "2"],
      search: "call",
      sort: undefined,
      workspaceId: "ws-1",
    })
  })

  test("builds a posts-list export from the list filters, never from post ids", async () => {
    await callRoute(
      "kind=rows&channels=messenger&channels=instagram&hasComments=false&sort=mostComments",
    )

    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          channels: ["messenger", "instagram"],
          hasComments: false,
        },
        kind: "rows",
        postIds: undefined,
        sort: "mostComments",
      }),
    )
  })

  test.each([
    "kind=rows&postId=1",
    "kind=rows&sort=oldestFirst",
    "kind=rows&channels=nope",
  ])("rejects an invalid posts-list export (%s)", async (query) => {
    const response = await callRoute(query)

    expect(response.status).toBe(400)
    expect(mocks.build).not.toHaveBeenCalled()
  })

  test("answers a UTF-8 CSV attachment with a BOM and the row facts", async () => {
    const response = await callRoute("kind=comments&postId=1")

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="post-comments-2026-11-23.csv"',
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Export-Row-Count")).toBe("1")
    expect(response.headers.get("X-Export-Truncated")).toBe("false")
    const bytes = Buffer.from(await response.arrayBuffer())
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(bytes.subarray(3).toString("utf8")).toBe(file.csv)
  })

  test("flags a truncated file", async () => {
    mocks.build.mockResolvedValue({ ...file, truncated: true })

    const response = await callRoute("kind=comments&postId=1")

    expect(response.headers.get("X-Export-Truncated")).toBe("true")
  })

  test("a trial-expired workspace is a 402 with its code and builds nothing (a download consumes a message)", async () => {
    mocks.assertNotBlocked.mockRejectedValue(
      new FakeChatbotXException("expired", "workspaceBlocked", 402),
    )

    const response = await callRoute("kind=comments&postId=1")

    expect(mocks.assertNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({ code: "workspaceBlocked" })
    expect(mocks.build).not.toHaveBeenCalled()
  })

  test("a download with no message left is a 429 with its code and no file", async () => {
    mocks.build.mockRejectedValue(
      new FakeChatbotXException("used up", "postMessageQuotaExceeded", 429),
    )

    const response = await callRoute("kind=comments&postId=1")

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      code: "postMessageQuotaExceeded",
    })
  })

  test("a refused phone export is a 403 with its code, not a partial file", async () => {
    mocks.build.mockRejectedValue(
      new FakeChatbotXException("no phones", "FORBIDDEN", 403),
    )

    const response = await callRoute("kind=phones&postId=1")

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code: "FORBIDDEN" })
  })

  test("an unknown post is a 404 and an unexpected failure is rethrown", async () => {
    mocks.build.mockRejectedValueOnce(
      new FakeChatbotXException("missing", "notFound", 404),
    )
    expect((await callRoute("kind=comments&postId=1")).status).toBe(404)

    mocks.build.mockRejectedValueOnce(new Error("boom"))
    await expect(callRoute("kind=comments&postId=1")).rejects.toThrow("boom")
  })
})
