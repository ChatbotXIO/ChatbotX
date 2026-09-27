import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

// Only the network client is stubbed; the pure error predicates stay real so
// the page-size backoff below exercises the same rule production uses.
vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: {
    get: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const { getUserPages } = await import("../src/apis/auth")
const { facebookGraphClient } = await import("../src/lib/http-client")
const { MessengerAPIException } = await import("../src/exception")

const mockGet = facebookGraphClient.get as MockInstance

const adminTasks = [
  "ADVERTISE",
  "ANALYZE",
  "CREATE_CONTENT",
  "MANAGE",
  "MODERATE",
]

const directPage = {
  id: "page-direct",
  name: "Direct Page",
  access_token: "direct-token",
  tasks: adminTasks,
}

// Business Manager lookup was disabled in #744 — getUserPages now returns
// direct /me/accounts pages only and always reports bmLookupFailed: false.
describe("getUserPages", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("returns /me/accounts pages with connectability", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...directPage, isConnectable: true }],
      bmLookupFailed: false,
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith("v23.0/me/accounts", expect.anything())
  })

  test("does not call the Business Manager endpoints", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    await getUserPages("user-token")

    const endpoints = mockGet.mock.calls.map((call) => call[0])
    expect(endpoints).toEqual(["v23.0/me/accounts"])
  })

  test("paginates /me/accounts until the cursor ends", async () => {
    const directPage2 = {
      id: "page-direct-2",
      name: "Direct Page 2",
      access_token: "direct-token-2",
      tasks: adminTasks,
    }

    mockGet
      .mockResolvedValueOnce({
        data: [directPage],
        paging: {
          cursors: { after: "direct-cursor" },
          next: "https://graph.facebook.com/v23.0/me/accounts?after=direct-cursor",
        },
      })
      .mockResolvedValueOnce({ data: [directPage2] })

    const result = await getUserPages("user-token")

    expect(result.bmLookupFailed).toBe(false)
    expect(result.pages).toEqual([
      { ...directPage, isConnectable: true },
      { ...directPage2, isConnectable: true },
    ])
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(mockGet).toHaveBeenLastCalledWith("v23.0/me/accounts", {
      searchParams: expect.objectContaining({ after: "direct-cursor" }),
    })
  })

  test("classifies pages and sorts connectable pages first", async () => {
    const missingTaskPage = {
      id: "page-missing-task",
      name: "Missing Task",
      access_token: "missing-task-token",
      tasks: adminTasks.filter((task) => task !== "MODERATE"),
    }
    const emptyTasksPage = {
      id: "page-empty-tasks",
      name: "Empty Tasks",
      access_token: "empty-tasks-token",
      tasks: [],
    }
    const missingTokenPage = {
      id: "page-missing-token",
      name: "Missing Token",
      tasks: adminTasks,
    }

    mockGet.mockResolvedValueOnce({
      data: [missingTaskPage, directPage, emptyTasksPage, missingTokenPage],
    })

    const result = await getUserPages("user-token")

    expect(result.pages).toEqual([
      { ...directPage, isConnectable: true },
      { ...missingTaskPage, isConnectable: false },
      { ...emptyTasksPage, isConnectable: false },
      { ...missingTokenPage, isConnectable: false },
    ])
  })

  test("requests page fields with limit=50 and the user token", async () => {
    mockGet.mockResolvedValueOnce({ data: [directPage] })

    await getUserPages("user-token")

    expect(mockGet).toHaveBeenCalledWith("v23.0/me/accounts", {
      searchParams: expect.objectContaining({
        fields: "id,name,access_token,category,tasks",
        access_token: "user-token",
        limit: "50",
      }),
    })
  })
  // Meta answers `/me/accounts` with `{"error":{"code":1,"message":"Please
  // reduce the amount of data you're asking for, then retry your request"}}`
  // for users whose pages carry too much data per response. The fix is a
  // smaller page, and because the cursor from a failed walk is not reusable,
  // every retry starts again from the first page.
  describe("page-size backoff on Graph error code 1", () => {
    const dataTooLarge = () =>
      new MessengerAPIException(
        "Please reduce the amount of data you're asking for, then retry your request",
        500,
        1,
        null,
        undefined,
        {
          httpStatus: 500,
          errorBody: {
            error: {
              code: 1,
              message:
                "Please reduce the amount of data you're asking for, then retry your request",
            },
          },
        },
      )

    const requestedLimits = () =>
      mockGet.mock.calls.map((call) => call[1].searchParams.limit)

    test("shrinks 50 → 25 → 10 and restarts from the first page", async () => {
      mockGet
        .mockRejectedValueOnce(dataTooLarge())
        .mockRejectedValueOnce(dataTooLarge())
        .mockResolvedValueOnce({ data: [directPage] })

      const result = await getUserPages("user-token")

      expect(result.pages).toEqual([{ ...directPage, isConnectable: true }])
      expect(requestedLimits()).toEqual(["50", "25", "10"])
      for (const call of mockGet.mock.calls) {
        expect(call[1].searchParams).not.toHaveProperty("after")
      }
    })

    test("drops pages already read when a later page fails, so nothing is duplicated", async () => {
      const directPage2 = { ...directPage, id: "page-direct-2" }
      mockGet
        .mockResolvedValueOnce({
          data: [directPage],
          paging: {
            cursors: { after: "c1" },
            next: "https://graph.facebook.com/v23.0/me/accounts?after=c1",
          },
        })
        .mockRejectedValueOnce(dataTooLarge())
        .mockResolvedValueOnce({ data: [directPage, directPage2] })

      const result = await getUserPages("user-token")

      expect(result.pages.map((page) => page.id)).toEqual([
        "page-direct",
        "page-direct-2",
      ])
      expect(requestedLimits()).toEqual(["50", "50", "25"])
      expect(mockGet.mock.calls[1][1].searchParams.after).toBe("c1")
      expect(mockGet.mock.calls[2][1].searchParams).not.toHaveProperty("after")
    })

    test("keeps the 2000-page ceiling when the page shrinks, instead of stopping after 20 requests", async () => {
      const TOTAL_PAGES = 250 // > 20 requests × 10 per page
      const pageAt = (index: number) => ({
        ...directPage,
        id: `page-${index}`,
      })
      mockGet
        .mockRejectedValueOnce(dataTooLarge())
        .mockRejectedValueOnce(dataTooLarge())
        .mockImplementation((_endpoint: string, options) => {
          const offset = Number(options.searchParams.after ?? 0)
          const size = Number(options.searchParams.limit)
          const next = offset + size
          return Promise.resolve({
            data: Array.from({ length: size }, (_, i) => pageAt(offset + i)),
            paging:
              next < TOTAL_PAGES
                ? {
                    cursors: { after: String(next) },
                    next: "https://graph.facebook.com/next",
                  }
                : undefined,
          })
        })

      const result = await getUserPages("user-token")

      expect(result.pages).toHaveLength(TOTAL_PAGES)
      expect(
        requestedLimits()
          .slice(2)
          .every((limit) => limit === "10"),
      ).toBe(true)
      expect(mockGet).toHaveBeenCalledTimes(2 + TOTAL_PAGES / 10)
    })

    test("throws the Graph error once the smallest page size also fails", async () => {
      mockGet
        .mockRejectedValueOnce(dataTooLarge())
        .mockRejectedValueOnce(dataTooLarge())
        .mockRejectedValueOnce(dataTooLarge())

      await expect(getUserPages("user-token")).rejects.toMatchObject({
        code: 1,
        message: expect.stringContaining("reduce the amount of data"),
      })
      expect(requestedLimits()).toEqual(["50", "25", "10"])
    })

    test("does not shrink for any other Graph error", async () => {
      mockGet.mockRejectedValueOnce(
        new MessengerAPIException("Invalid OAuth access token", 400, 190, 467),
      )

      await expect(getUserPages("user-token")).rejects.toBeInstanceOf(
        MessengerAPIException,
      )
      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    test("does not shrink for the generic code-1 'API Unknown' failure", async () => {
      mockGet.mockRejectedValueOnce(
        new MessengerAPIException("An unknown error occurred", 500, 1, null),
      )

      await expect(getUserPages("user-token")).rejects.toBeInstanceOf(
        MessengerAPIException,
      )
      expect(mockGet).toHaveBeenCalledTimes(1)
    })
  })
})
