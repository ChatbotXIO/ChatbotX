import sharp from "sharp"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  pinnedGet: vi.fn(),
  putObject: vi.fn(),
}))

vi.mock("../src/net/pinned-fetch", () => ({ pinnedGet: mocks.pinnedGet }))
vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { putObject: mocks.putObject },
}))

const { importFeedImage } = await import("../src/net/feed-image-import")

const png = await sharp({
  create: { background: "#336699", channels: 3, height: 8, width: 8 },
})
  .png()
  .toBuffer()

const ok = (body: Uint8Array) => new Response(body as BodyInit, { status: 200 })
const redirect = (location: string) =>
  new Response(null, { headers: { location }, status: 302 })
const input = (url: string) => ({
  path: "public/space/1/media-library/feed-1-x",
  signal: AbortSignal.timeout(5000),
  url,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pinnedGet.mockReset()
  mocks.checkSsrfSafety.mockReset()
  mocks.checkSsrfSafety.mockResolvedValue({
    resolvedIps: ["93.184.216.34"],
    unsafe: false,
  })
  mocks.putObject.mockResolvedValue({})
})

describe("importFeedImage", () => {
  test("stores the re-encoded picture, not the downloaded bytes", async () => {
    mocks.pinnedGet.mockResolvedValue(ok(png))

    const imported = await importFeedImage(input("https://img.test/a.png"))

    expect(imported).toMatchObject({
      height: 8,
      mimeType: "image/jpeg",
      width: 8,
    })
    const [path, body, options] = mocks.putObject.mock.calls[0] as [
      string,
      Buffer,
      { ContentType: string },
    ]
    expect(path).toBe("public/space/1/media-library/feed-1-x")
    expect(options.ContentType).toBe("image/jpeg")
    expect(body.equals(png)).toBe(false)
  })

  test("every hop goes through the address guard; a blocked hop is refused", async () => {
    mocks.pinnedGet
      .mockResolvedValueOnce(redirect("http://internal.test/x"))
      .mockResolvedValueOnce(ok(png))
    mocks.checkSsrfSafety
      .mockResolvedValueOnce({ resolvedIps: ["93.184.216.34"], unsafe: false })
      .mockResolvedValueOnce({ resolvedIps: [], unsafe: true })

    await expect(
      importFeedImage(input("https://img.test/a")),
    ).rejects.toMatchObject({
      code: "blocked",
    })
    expect(mocks.checkSsrfSafety).toHaveBeenCalledTimes(2)
  })

  test("follows at most two redirects", async () => {
    mocks.pinnedGet.mockImplementation(async () =>
      redirect("https://img.test/next"),
    )

    await expect(
      importFeedImage(input("https://img.test/a")),
    ).rejects.toMatchObject({
      code: "unreachable",
    })
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(3)
  })

  test("a streamed body over 8 MB is aborted even without a content length", async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1
        controller.enqueue(chunk)
        if (sent > 20) {
          controller.close()
        }
      },
    })
    mocks.pinnedGet.mockResolvedValue(new Response(body, { status: 200 }))

    await expect(
      importFeedImage(input("https://img.test/big")),
    ).rejects.toMatchObject({
      code: "tooLarge",
    })
    expect(sent).toBeLessThan(12)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("an http address is tried over https first, and used only when that fails", async () => {
    mocks.pinnedGet
      .mockRejectedValueOnce(new Error("tls"))
      .mockResolvedValueOnce(ok(png))

    await importFeedImage(input("http://img.test/a.png"))

    expect(mocks.pinnedGet.mock.calls[0]?.[0].url).toBe(
      "https://img.test/a.png",
    )
    expect(mocks.pinnedGet.mock.calls[1]?.[0].url).toBe("http://img.test/a.png")
  })

  test("an over-size or refused https answer is not downloaded again over http", async () => {
    mocks.pinnedGet.mockResolvedValue(
      new Response(null, {
        headers: { "content-length": String(9 * 1024 * 1024) },
        status: 200,
      }),
    )
    await expect(
      importFeedImage(input("http://img.test/big.png")),
    ).rejects.toMatchObject({ code: "tooLarge" })
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(1)

    mocks.pinnedGet.mockClear()
    mocks.checkSsrfSafety.mockClear()
    mocks.checkSsrfSafety.mockResolvedValue({ resolvedIps: [], unsafe: true })
    await expect(
      importFeedImage(input("http://img.test/a.png")),
    ).rejects.toMatchObject({ code: "blocked" })
    expect(mocks.pinnedGet).not.toHaveBeenCalled()
    expect(mocks.checkSsrfSafety).toHaveBeenCalledTimes(1)
  })

  test("a redirect to an address that cannot be read is an unreachable picture, not a raw TypeError", async () => {
    mocks.pinnedGet.mockResolvedValue(redirect("http://[bad"))

    await expect(
      importFeedImage(input("https://img.test/a")),
    ).rejects.toMatchObject({ code: "unreachable" })
  })

  test("a non-picture (HTML served as an image) is refused and nothing is stored", async () => {
    mocks.pinnedGet.mockResolvedValue(
      ok(Buffer.from("<html><script>x</script></html>")),
    )

    await expect(
      importFeedImage(input("https://img.test/a.png")),
    ).rejects.toMatchObject({
      code: "notAnImage",
    })
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("a failing store is reported as storage", async () => {
    mocks.pinnedGet.mockResolvedValue(ok(png))
    mocks.putObject.mockRejectedValue(new Error("s3 down"))

    await expect(
      importFeedImage(input("https://img.test/a.png")),
    ).rejects.toMatchObject({
      code: "storage",
    })
  })
})
