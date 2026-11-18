import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ assertPublicUrl: vi.fn() }))

vi.mock("../../net/ssrf-guard", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
}))

const { probeImageMimeType } = await import("../probe-image-url")

const URL_NO_EXT = "https://cdn.example/public/whatsapp/1/2/2026/11/17/123"

const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { headers, status })

describe("probeImageMimeType", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertPublicUrl.mockResolvedValue(undefined)
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("returns the served image type from a HEAD request", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { "content-type": "image/jpeg" }),
    )

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBe("image/jpeg")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" })
  })

  test("drops content-type parameters and lowercases", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { "content-type": "Image/PNG; charset=binary" }),
    )

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBe("image/png")
  })

  test("falls back to a one-byte ranged GET when HEAD is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(405))
      .mockResolvedValueOnce(reply(206, { "content-type": "image/webp" }))

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBe("image/webp")
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { Range: "bytes=0-0" },
      method: "GET",
    })
  })

  test.each([
    "text/html",
    "application/octet-stream",
    "",
  ])("returns null for a non-image content type %j", async (contentType) => {
    fetchMock.mockResolvedValueOnce(
      reply(200, contentType ? { "content-type": contentType } : {}),
    )

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBeNull()
  })

  test("returns null when both HEAD and GET fail", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(404))
      .mockResolvedValueOnce(reply(404))

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBeNull()
  })

  test("returns null without requesting a URL the SSRF guard rejects", async () => {
    mocks.assertPublicUrl.mockRejectedValue(new Error("not allowed"))

    await expect(
      probeImageMimeType("http://169.254.169.254/latest/meta-data"),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("SSRF-checks every redirect hop", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(302, { location: "http://10.0.0.5/internal" }),
    )
    mocks.assertPublicUrl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("not allowed"))

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("returns null when the request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))

    await expect(probeImageMimeType(URL_NO_EXT)).resolves.toBeNull()
  })
})
