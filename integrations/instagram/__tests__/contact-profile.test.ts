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
const { contactHandlers } = await import("../src/handlers/contact")

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

  test("maps an opt-in relationship snapshot without putting it in contact fields", async () => {
    instagramGet
      .mockResolvedValueOnce({ id: "igsid-1", name: "Ada", username: "ada" })
      .mockResolvedValueOnce({
        id: "igsid-1",
        follower_count: 123,
        is_business_follow_user: false,
        is_user_follow_business: true,
        is_verified_user: true,
      })

    await expect(
      contactHandlers.getProfile?.({
        ctx: {
          auth: {
            metadata: { version: "v23.0" },
            tokens: { accessToken: "page-token" },
          },
        },
        data: { includeInstagramSnapshot: true, sourceId: "igsid-1" },
      } as never),
    ).resolves.toEqual({
      firstName: "Ada",
      instagramProfile: {
        follow: true,
        followers: 123,
        following: false,
        verified: true,
      },
      sourceId: "igsid-1",
      sourceUsername: "ada",
    })
  })

  test("keeps a successful snapshot when the independent name lookup fails", async () => {
    instagramGet
      .mockRejectedValueOnce(new Error("profile lookup unavailable"))
      .mockResolvedValueOnce({
        id: "igsid-1",
        follower_count: 123,
        is_business_follow_user: false,
        is_user_follow_business: true,
        is_verified_user: true,
      })

    await expect(
      contactHandlers.getProfile?.({
        ctx: {
          auth: {
            metadata: { version: "v23.0" },
            tokens: { accessToken: "page-token" },
          },
        },
        data: { includeInstagramSnapshot: true, sourceId: "igsid-1" },
      } as never),
    ).resolves.toEqual({
      sourceId: "igsid-1",
      instagramProfile: {
        follow: true,
        followers: 123,
        following: false,
        verified: true,
      },
    })
  })
})
