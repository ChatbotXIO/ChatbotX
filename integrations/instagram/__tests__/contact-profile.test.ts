import { beforeEach, describe, expect, test, vi } from "vitest"

const instagramGet = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/http-client", () => ({
  instagramBusinessClient: {
    get: instagramGet,
  },
}))

const { fetchInstagramContactProfile } = await import(
  "../src/apis/contact-profile"
)

describe("fetchInstagramContactProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("requests and maps the Instagram contact username", async () => {
    instagramGet.mockResolvedValue({
      id: "igsid-1",
      username: "contact_username",
      follower_count: 123,
      is_business_follow_user: false,
      is_user_follow_business: true,
      is_verified_user: true,
    })

    await expect(
      fetchInstagramContactProfile({
        igsid: "igsid-1",
        accessToken: "page-token",
        version: "v23.0",
      }),
    ).resolves.toEqual({
      username: "contact_username",
      followersCount: 123,
      followsBusiness: true,
      businessFollowUser: false,
      isVerified: true,
    })

    const calledUrl = instagramGet.mock.calls[0][0] as string
    expect(calledUrl).toContain("v23.0/igsid-1?")
    expect(calledUrl).toContain("username")
    expect(calledUrl).toContain("follower_count")
  })
})
