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
  logger: { warn: vi.fn(), error: vi.fn() },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules
const { getUserPages } = await import("../src/apis/auth")
const { facebookGraphClient } = await import("../src/lib/http-client")

const mockGet = facebookGraphClient.get as MockInstance

const directPage = {
  id: "page-direct",
  name: "Direct Page",
  access_token: "direct-token",
}

describe("getUserPages", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("no businesses — returns /me/accounts data unchanged", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockResolvedValueOnce({ data: [] }) // /me/businesses

    const result = await getUserPages("user-token")

    expect(result).toEqual([directPage])
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

    expect(result).toEqual(
      expect.arrayContaining([directPage, ownedPage, clientPage]),
    )
    expect(result).toHaveLength(3)
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

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(directPage)
  })

  test("BM page missing access_token is excluded", async () => {
    const pageWithoutToken = { id: "page-no-token", name: "No Token Page" }

    mockGet
      .mockResolvedValueOnce({ data: [] }) // /me/accounts
      .mockResolvedValueOnce({ data: [{ id: "biz1", name: "Biz 1" }] }) // /me/businesses
      .mockResolvedValueOnce({ data: [pageWithoutToken] }) // owned_pages
      .mockResolvedValueOnce({ data: [] }) // client_pages

    const result = await getUserPages("user-token")

    expect(result).toEqual([])
  })

  test("BM fetch failure falls back silently to direct pages only", async () => {
    mockGet
      .mockResolvedValueOnce({ data: [directPage] }) // /me/accounts
      .mockRejectedValueOnce(new Error("business_management not granted")) // /me/businesses

    const result = await getUserPages("user-token")

    expect(result).toEqual([directPage])
  })

  test("paginates /me/businesses and owned_pages until cursors are exhausted", async () => {
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
      .mockResolvedValueOnce({ data: [] }) // /me/accounts
      .mockResolvedValueOnce({
        data: [{ id: "biz1", name: "Biz 1" }],
        paging: {
          cursors: { after: "biz-cursor" },
          next: "https://graph.facebook.com/v23.0/me/businesses?after=biz-cursor",
        },
      }) // /me/businesses page 1
      .mockResolvedValueOnce({ data: [] }) // /me/businesses page 2 (no more)
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

    expect(result).toEqual(expect.arrayContaining([ownedPage1, ownedPage2]))
    expect(result).toHaveLength(2)
    expect(mockGet).toHaveBeenCalledTimes(6)
  })
})
