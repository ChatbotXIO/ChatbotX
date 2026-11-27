import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/http-client", () => ({ instagramGraphClient: { get } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { fetchInstagramFacebookProfilePictureUrl } from "../src/apis/profile-picture"

describe("fetchInstagramFacebookProfilePictureUrl", () => {
  beforeEach(() => get.mockReset())

  test("reads profile_picture_url of the IG user with the Page token in a header", async () => {
    get.mockResolvedValue({
      profile_picture_url: "https://scontent.cdninstagram.com/p.jpg",
    })

    const url = await fetchInstagramFacebookProfilePictureUrl({
      accessToken: "TOKEN",
      igId: "178",
    })

    expect(url).toBe("https://scontent.cdninstagram.com/p.jpg")
    const [endpoint, options] = get.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ]
    expect(endpoint.endsWith("/178?fields=profile_picture_url")).toBe(true)
    expect(endpoint).not.toContain("TOKEN")
    expect(options.headers.Authorization).toBe("Bearer TOKEN")
  })

  test("returns null when the field is absent", async () => {
    get.mockResolvedValue({})

    await expect(
      fetchInstagramFacebookProfilePictureUrl({ accessToken: "T", igId: "1" }),
    ).resolves.toBeNull()
  })
})
