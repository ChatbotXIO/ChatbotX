import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", () => ({
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

describe("getUserPages", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("no businesses - returns /me/accounts pages with connectability", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [] }) // /me/businesses

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...directPage, isConnectable: true }],
      bmLookupFailed: false,
    })
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  test("BM owned/client pages with non-overlapping ids are merged in", async () => {
    const ownedPage = {
      id: "page-owned",
      name: "Owned Page",
      access_token: "owned-token",
    }
    const clientPage = {
      id: "page-client",
      name: "Client Page",
      access_token: "client-token",
    }

    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [ownedPage] }) // owned_pages
      .mockResolvedValueOnce({ data: [clientPage] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result.bmLookupFailed).toBe(false)
    expect(result.pages).toEqual(
      expect.arrayContaining([
        { ...directPage, isConnectable: true },
        { ...ownedPage, isConnectable: true },
        { ...clientPage, isConnectable: true },
      ]),
    )
    expect(result.pages).toHaveLength(3)
  })

  test("page id colliding with /me/accounts keeps the direct-accounts record", async () => {
    const bmDuplicate = {
      id: directPage.id,
      name: "Stale BM Name",
      access_token: "bm-token",
    }

    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [bmDuplicate] }) // owned_pages
      .mockResolvedValueOnce({ data: [] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result.bmLookupFailed).toBe(false)
    expect(result.pages).toEqual([{ ...directPage, isConnectable: true }])
  })

  test("BM page missing access_token is returned as non-connectable", async () => {
    const pageWithoutToken = { id: "page-no-token", name: "No Token Page" }

    mockGet
      .mockResolvedValueOnce({ data: [] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [pageWithoutToken] }) // owned_pages
      .mockResolvedValueOnce({ data: [] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...pageWithoutToken, isConnectable: false }],
      bmLookupFailed: false,
    })
  })

  test("BM lookup failure returns direct pages and exposes the failure flag", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockRejectedValueOnce(new Error("business_management not granted")) // /me/businesses

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...directPage, isConnectable: true }],
      bmLookupFailed: true,
    })
  })

  test("paginates /me/accounts, /me/businesses, and owned_pages", async () => {
    const directPage2 = {
      id: "page-direct-2",
      name: "Direct Page 2",
      access_token: "direct-token-2",
      tasks: adminTasks,
    }
    const ownedPage1 = {
      id: "page-owned-1",
      name: "Owned 1",
      access_token: "t1",
    }
    const ownedPage2 = {
      id: "page-owned-2",
      name: "Owned 2",
      access_token: "t2",
    }

    mockGet
      .mockResolvedValueOnce({
        data: [directPage],
        paging: {
          cursors: { after: "direct-cursor" },
          next: "https://graph.facebook.com/v23.0/me/accounts?after=direct-cursor",
        },
      }) // /me/accounts page 1
      .mockResolvedValueOnce({ data: [directPage2] }) // /me/accounts page 2
      .mockResolvedValueOnce({
        data: [{ id: "biz1", name: "Biz 1" }],
        paging: {
          cursors: { after: "biz-cursor" },
          next: "https://graph.facebook.com/v23.0/me/businesses?after=biz-cursor",
        },
      }) // /me/businesses page 1
      .mockResolvedValueOnce({ data: [] }) // /me/businesses page 2
      .mockResolvedValueOnce({
        data: [ownedPage1],
        paging: {
          cursors: { after: "owned-cursor" },
          next: "https://graph.facebook.com/v23.0/biz1/owned_pages?after=owned-cursor",
        },
      }) // owned_pages page 1
      .mockResolvedValueOnce({ data: [ownedPage2] }) // owned_pages page 2
      .mockResolvedValueOnce({ data: [] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result.bmLookupFailed).toBe(false)
    expect(result.pages).toEqual(
      expect.arrayContaining([
        { ...directPage, isConnectable: true },
        { ...directPage2, isConnectable: true },
        { ...ownedPage1, isConnectable: true },
        { ...ownedPage2, isConnectable: true },
      ]),
    )
    expect(result.pages).toHaveLength(4)
    expect(mockGet).toHaveBeenCalledTimes(7)
  })

  test("classifies direct and BM-only pages and sorts connectable pages first", async () => {
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
    const missingTasksPage = {
      id: "page-missing-tasks",
      name: "Missing Tasks",
      access_token: "missing-tasks-token",
    }
    const bmPageWithToken = {
      id: "page-bm-token",
      name: "BM Token",
      access_token: "bm-token",
    }
    const bmPageWithoutToken = {
      id: "page-bm-no-token",
      name: "BM No Token",
    }

    mockGet
      .mockResolvedValueOnce({
        data: [missingTaskPage, directPage, emptyTasksPage, missingTasksPage],
      }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [bmPageWithToken, bmPageWithoutToken] }) // owned_pages
      .mockResolvedValueOnce({ data: [] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result.pages).toEqual([
      { ...directPage, isConnectable: true },
      { ...bmPageWithToken, isConnectable: true },
      { ...missingTaskPage, isConnectable: false },
      { ...emptyTasksPage, isConnectable: false },
      { ...missingTasksPage, isConnectable: false },
      { ...bmPageWithoutToken, isConnectable: false },
    ])
    expect(mockGet).toHaveBeenCalledWith("v23.0/biz1/owned_pages", {
      searchParams: expect.objectContaining({
        fields: "id,name,access_token,category",
      }),
    })
  })

  test("passes limit=100 on every Graph page request", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [] }) // owned_pages
      .mockResolvedValueOnce({ data: [] }) // client_pages

    await getUserPages("user-token")

    for (const call of mockGet.mock.calls) {
      expect(call[1]?.searchParams).toEqual(
        expect.objectContaining({ limit: "100" }),
      )
    }
  })

  test("one business failure does not fail the whole BM lookup", async () => {
    const recoveredPage = {
      id: "page-recovered",
      name: "Recovered Page",
      access_token: "recovered-token",
    }

    mockGet
      .mockResolvedValueOnce({ data: [] }) // /me/accounts
      .mockResolvedValueOnce({
        data: [
          { id: "biz1", name: "Biz 1" },
          { id: "biz2", name: "Biz 2" },
        ],
      }) // /me/businesses
      .mockRejectedValueOnce(new Error("owned pages unavailable")) // biz1 owned_pages
      .mockResolvedValueOnce({ data: [] }) // biz1 client_pages
      .mockResolvedValueOnce({ data: [recoveredPage] }) // biz2 owned_pages
      .mockResolvedValueOnce({ data: [] }) // biz2 client_pages

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...recoveredPage, isConnectable: true }],
      bmLookupFailed: false,
    })
  })

  test("one BM edge failure still returns pages from the successful edge", async () => {
    const ownedPage = {
      id: "page-owned-recovered",
      name: "Owned Recovered",
      access_token: "owned-recovered-token",
    }

    mockGet
      .mockResolvedValueOnce({ data: [] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [ownedPage] }) // owned_pages
      .mockRejectedValueOnce(new Error("client pages unavailable")) // client_pages

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...ownedPage, isConnectable: true }],
      bmLookupFailed: false,
    })
  })

  test("all BM page edge failures surface the BM lookup warning flag", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockRejectedValueOnce(new Error("owned pages unavailable")) // owned_pages
      .mockRejectedValueOnce(new Error("client pages unavailable")) // client_pages

    const result = await getUserPages("user-token")

    expect(result).toEqual({
      pages: [{ ...directPage, isConnectable: true }],
      bmLookupFailed: true,
    })
  })
})
