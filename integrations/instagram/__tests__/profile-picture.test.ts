import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/http-client", () => ({ instagramBusinessClient: { get } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { fetchInstagramProfilePictureUrl } from "../src/apis/profile-picture"

describe("fetchInstagramProfilePictureUrl", () => {
  beforeEach(() => get.mockReset())

  test("reads profile_picture_url from /me with a bearer header", async () => {
    get.mockResolvedValue({
      profile_picture_url: "https://scontent.cdninstagram.com/p.jpg",
    })

    const url = await fetchInstagramProfilePictureUrl({ accessToken: "TOKEN" })

    expect(url).toBe("https://scontent.cdninstagram.com/p.jpg")
    const [endpoint, options] = get.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ]
    expect(endpoint).toContain("/me?fields=profile_picture_url")
    expect(endpoint).not.toContain("TOKEN")
    expect(options.headers.Authorization).toBe("Bearer TOKEN")
  })

  test("returns null when the field is absent", async () => {
    get.mockResolvedValue({ id: "1" })

    await expect(
      fetchInstagramProfilePictureUrl({ accessToken: "T" }),
    ).resolves.toBeNull()
  })
})
