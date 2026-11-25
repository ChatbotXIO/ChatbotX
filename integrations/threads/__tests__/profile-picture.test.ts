import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/http-client", () => ({ threadsGraphClient: { get } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { fetchThreadsProfilePictureUrl } from "../src/apis/profile-picture"

describe("fetchThreadsProfilePictureUrl", () => {
  beforeEach(() => get.mockReset())

  test("reads threads_profile_picture_url from /me with a bearer header", async () => {
    get.mockResolvedValue({
      threads_profile_picture_url: "https://scontent.cdninstagram.com/t.jpg",
    })

    const url = await fetchThreadsProfilePictureUrl({ accessToken: "TOKEN" })

    expect(url).toBe("https://scontent.cdninstagram.com/t.jpg")
    const [endpoint, options] = get.mock.calls[0] as [
      string,
      { headers: Record<string, string>; searchParams: Record<string, string> },
    ]
    expect(endpoint.endsWith("/me")).toBe(true)
    expect(options.searchParams).toEqual({
      fields: "threads_profile_picture_url",
    })
    expect(options.headers.Authorization).toBe("Bearer TOKEN")
  })

  test("returns null when the field is absent", async () => {
    get.mockResolvedValue({})

    await expect(
      fetchThreadsProfilePictureUrl({ accessToken: "T" }),
    ).resolves.toBeNull()
  })
})
