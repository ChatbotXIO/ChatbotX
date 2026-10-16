import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/http-client")>()
  return { ...actual, instagramGraphClient: { get: mockGet } }
})

const { getPageInstagramAccess } = await import("../src/apis/auth")

const input = {
  pageId: "page-1",
  userAccessToken: "user-token",
  version: "v25.0",
}

describe("getPageInstagramAccess", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("reads the one stored page, so no /me/accounts paging can miss it", async () => {
    mockGet.mockResolvedValue({
      access_token: "page-token",
      instagram_business_account: { id: "ig-1" },
    })

    await expect(getPageInstagramAccess(input)).resolves.toEqual({
      igId: "ig-1",
      pageAccessToken: "page-token",
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith("v25.0/page-1", {
      searchParams: {
        fields: "access_token,instagram_business_account",
        access_token: "user-token",
      },
    })
  })

  test("is null when the user has no role on the page", async () => {
    mockGet.mockResolvedValue({ instagram_business_account: { id: "ig-1" } })

    await expect(getPageInstagramAccess(input)).resolves.toBeNull()
  })

  test("is null when the page has no linked Instagram account", async () => {
    mockGet.mockResolvedValue({ access_token: "page-token" })

    await expect(getPageInstagramAccess(input)).resolves.toBeNull()
  })

  test("surfaces a Graph failure instead of reporting a missing account", async () => {
    mockGet.mockRejectedValue(new Error("graph down"))

    await expect(getPageInstagramAccess(input)).rejects.toThrow("graph down")
  })
})
