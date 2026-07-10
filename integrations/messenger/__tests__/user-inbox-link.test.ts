import { beforeEach, describe, expect, test, vi } from "vitest"

const mockGet = vi.hoisted(() => vi.fn())

vi.mock("../src/exception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/exception")>()
  return { ...actual, rescue: (_: string, fn: () => Promise<unknown>) => fn() }
})

vi.mock("../src/lib/http-client", () => ({
  facebookGraphClient: { get: mockGet },
}))

const { getUserInboxLink } = await import("../src/apis/user-inbox-link")

const createProps = () => ({
  ctx: {
    auth: {
      authType: "oauth2" as const,
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUrl: "https://example.com/callback",
      tokens: { accessToken: "page-token" },
      version: "v23.0",
      metadata: {
        pageId: "page-1",
        pageName: "Page One",
        version: "v23.0",
      },
    },
  },
  input: { userId: "psid-1" },
})

describe("getUserInboxLink", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test("requests the conversation link for a page-scoped user", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: "t_1",
          link: "/1453585961452628/inbox/1453594044785153/?section=messages",
        },
      ],
    })

    await expect(getUserInboxLink(createProps())).resolves.toBe(
      "https://business.facebook.com/1453585961452628/inbox/1453594044785153",
    )
    expect(mockGet).toHaveBeenCalledWith("v23.0/me/conversations", {
      headers: {
        Authorization: "Bearer page-token",
      },
      searchParams: {
        user_id: "psid-1",
        fields: "link",
      },
    })
  })

  test("returns null when Graph returns no conversation", async () => {
    mockGet.mockResolvedValueOnce({ data: [] })

    await expect(getUserInboxLink(createProps())).resolves.toBeNull()
  })

  test("returns null when Graph lookup fails", async () => {
    mockGet.mockRejectedValueOnce(new Error("missing permission"))

    await expect(getUserInboxLink(createProps())).resolves.toBeNull()
  })
})
