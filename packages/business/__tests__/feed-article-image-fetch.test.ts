import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  pinnedGet: vi.fn(),
}))

vi.mock("../src/net/pinned-fetch", () => ({ pinnedGet: mocks.pinnedGet }))
vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))

const { findFeedArticleImage } = await import("../src/net/feed-article-image")

const html = (body: string, type = "text/html; charset=utf-8") =>
  new Response(body, { headers: { "content-type": type }, status: 200 })
const redirect = (location: string) =>
  new Response(null, { headers: { location }, status: 302 })
const OG =
  '<html><head><meta property="og:image" content="/c.jpg"></head><body></body></html>'
const input = (url: string) => ({
  signal: AbortSignal.timeout(5000),
  url,
})

beforeEach(() => {
  mocks.pinnedGet.mockReset()
  mocks.checkSsrfSafety.mockReset()
  mocks.checkSsrfSafety.mockResolvedValue({
    resolvedIps: ["93.184.216.34"],
    unsafe: false,
  })
})

describe("findFeedArticleImage", () => {
  test("returns the og:image resolved against the final address, sending no credentials", async () => {
    mocks.pinnedGet
      .mockResolvedValueOnce(redirect("https://www.news.test/story"))
      .mockResolvedValueOnce(html(OG))

    const url = await findFeedArticleImage(input("https://news.test/s"))

    expect(url).toBe("https://www.news.test/c.jpg")
    const sent = mocks.pinnedGet.mock.calls[1]?.[0] as {
      address: string
      headers: Record<string, string>
    }
    expect(sent.address).toBe("93.184.216.34")
    expect(Object.keys(sent.headers).sort()).toEqual(["accept", "user-agent"])
  })

  test("vets every hop with the SSRF guard and stops at a blocked one", async () => {
    mocks.checkSsrfSafety
      .mockResolvedValueOnce({ resolvedIps: ["93.184.216.34"], unsafe: false })
      .mockResolvedValueOnce({ resolvedIps: [], unsafe: true })
    mocks.pinnedGet.mockResolvedValueOnce(redirect("http://10.0.0.1/x"))

    await expect(
      findFeedArticleImage(input("https://news.test/s")),
    ).rejects.toMatchObject({ code: "blocked" })
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(1)
  })

  test("follows at most 2 redirects", async () => {
    mocks.pinnedGet.mockImplementation(async () =>
      redirect("https://news.test/next"),
    )

    await expect(
      findFeedArticleImage(input("https://news.test/s")),
    ).rejects.toMatchObject({ code: "articleUnreachable" })
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(3)
  })

  test("tries an http link over https first, and over http only when that fails", async () => {
    mocks.pinnedGet
      .mockRejectedValueOnce(new Error("no tls"))
      .mockResolvedValueOnce(html(OG))

    const url = await findFeedArticleImage(input("http://news.test/s"))

    expect(url).toBe("http://news.test/c.jpg")
    expect((mocks.pinnedGet.mock.calls[0]?.[0] as { url: string }).url).toBe(
      "https://news.test/s",
    )
    expect((mocks.pinnedGet.mock.calls[1]?.[0] as { url: string }).url).toBe(
      "http://news.test/s",
    )
  })

  test("a non-html answer or an error status is not read", async () => {
    mocks.pinnedGet.mockResolvedValueOnce(html("{}", "application/json"))
    await expect(
      findFeedArticleImage(input("https://news.test/s")),
    ).rejects.toMatchObject({ code: "articleNoImage" })

    mocks.pinnedGet.mockResolvedValueOnce(new Response("no", { status: 404 }))
    await expect(
      findFeedArticleImage(input("https://news.test/s")),
    ).rejects.toMatchObject({ code: "articleUnreachable" })
  })

  test("one oversized chunk is cut at the 1 MB cap: a og:image placed after the cap is never read", async () => {
    const pad = new TextEncoder().encode(`${" ".repeat(1_048_576)}`)
    const tail = new TextEncoder().encode(
      '<meta property="og:image" content="https://news.test/late.jpg"></head>',
    )
    const one = new Uint8Array(pad.byteLength + tail.byteLength)
    one.set(pad, 0)
    one.set(tail, pad.byteLength)
    mocks.pinnedGet.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(one)
            controller.close()
          },
        }),
        { headers: { "content-type": "text/html" }, status: 200 },
      ),
    )

    // The og:image sits after the 1 MB cap, so it is never read.
    expect(await findFeedArticleImage(input("https://news.test/s"))).toBeNull()
  })

  test("stops reading at the end of the head and at 1 MB", async () => {
    const chunks = [
      new TextEncoder().encode(OG.replace("</head>", "</head>")),
      new TextEncoder().encode("never read"),
    ]
    const cancelled = vi.fn()
    const stream = new ReadableStream({
      cancel: cancelled,
      pull(controller) {
        const next = chunks.shift()
        if (next) {
          controller.enqueue(next)
        } else {
          controller.close()
        }
      },
    })
    mocks.pinnedGet.mockResolvedValueOnce(
      new Response(stream, {
        headers: { "content-type": "text/html" },
        status: 200,
      }),
    )

    expect(await findFeedArticleImage(input("https://news.test/s"))).toBe(
      "https://news.test/c.jpg",
    )
    expect(cancelled).toHaveBeenCalledTimes(1)

    const big = new Uint8Array(600_000).fill(32)
    let reads = 0
    mocks.pinnedGet.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller) {
            reads += 1
            controller.enqueue(big)
          },
        }),
        { headers: { "content-type": "text/html" }, status: 200 },
      ),
    )
    expect(await findFeedArticleImage(input("https://news.test/s"))).toBeNull()
    expect(reads).toBeLessThanOrEqual(3)
  })

  test("a page that names no picture gives null", async () => {
    mocks.pinnedGet.mockResolvedValueOnce(html("<html><head></head></html>"))

    expect(await findFeedArticleImage(input("https://news.test/s"))).toBeNull()
  })
})
