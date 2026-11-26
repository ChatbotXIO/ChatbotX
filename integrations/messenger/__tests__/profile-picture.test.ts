import { beforeEach, describe, expect, test, vi } from "vitest"

const get = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/http-client", () => ({ facebookGraphClient: { get } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { fetchFacebookPagePictureUrl } from "../src/apis/page-picture"

describe("fetchFacebookPagePictureUrl", () => {
  beforeEach(() => get.mockReset())

  test("asks Graph for the large picture without a redirect and sends the token in a header", async () => {
    get.mockResolvedValue({ data: { url: "https://scontent.fbcdn.net/p.jpg" } })

    const url = await fetchFacebookPagePictureUrl({
      accessToken: "TOKEN",
      pageId: "123",
    })

    expect(url).toBe("https://scontent.fbcdn.net/p.jpg")
    const [endpoint, options] = get.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(endpoint.endsWith("/123/picture")).toBe(true)
    expect(options.searchParams).toEqual({ redirect: "0", type: "large" })
    expect(options.headers).toEqual({ Authorization: "Bearer TOKEN" })
    expect(JSON.stringify(options.searchParams)).not.toContain("TOKEN")
  })

  test("a silhouette placeholder or an empty body is no picture", async () => {
    get.mockResolvedValueOnce({
      data: { is_silhouette: true, url: "https://x/s.jpg" },
    })
    get.mockResolvedValueOnce({})

    await expect(
      fetchFacebookPagePictureUrl({ accessToken: "T", pageId: "1" }),
    ).resolves.toBeNull()
    await expect(
      fetchFacebookPagePictureUrl({ accessToken: "T", pageId: "1" }),
    ).resolves.toBeNull()
  })
})
