import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  pinnedGet: vi.fn(),
}))

vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))
// A short budget so the timeout case runs in real time.
vi.mock("../src/social-post-feed/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/social-post-feed/limits")>()),
  POST_FEED_FETCH_BUDGET_MS: 50,
}))
vi.mock("../src/net/pinned-fetch", () => ({ pinnedGet: mocks.pinnedGet }))

const { fetchFeed } = await import("../src/net/feed-fetch")
const { FeedFetchError } = await import("../src/social-post-feed/fetcher")

const input = {
  etag: null,
  lastModified: null,
  url: "https://example.com/feed.xml",
}
const safe = { resolvedIps: ["93.184.216.34"], unsafe: false }

const xml = (
  body: string,
  headers: Record<string, string> = {},
  status = 200,
): Response =>
  new Response(body, {
    headers: { "content-type": "application/rss+xml", ...headers },
    status,
  })

const codeOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run
  } catch (error) {
    if (error instanceof FeedFetchError) {
      return error.code
    }
    throw error
  }
  return "none"
}

describe("fetchFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkSsrfSafety.mockResolvedValue(safe)
  })

  test("connects only to the vetted address and sends the stored validators", async () => {
    mocks.pinnedGet.mockResolvedValue(xml("<rss/>", { etag: '"v2"' }))

    const result = await fetchFeed({
      ...input,
      etag: '"v1"',
      lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
    })

    expect(result).toEqual({
      body: "<rss/>",
      etag: '"v2"',
      kind: "ok",
      lastModified: null,
    })
    expect(mocks.pinnedGet).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "93.184.216.34",
        headers: expect.objectContaining({
          "if-modified-since": "Mon, 01 Jan 2026 00:00:00 GMT",
          "if-none-match": '"v1"',
        }),
        url: input.url,
      }),
    )
  })

  test("refuses an address the SSRF guard rejects, before any request", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({ unsafe: true })

    expect(await codeOf(fetchFeed(input))).toBe("blocked")
    expect(mocks.pinnedGet).not.toHaveBeenCalled()
  })

  test("vets every redirect hop and refuses one that leads to an internal address", async () => {
    mocks.pinnedGet.mockResolvedValue(
      Response.redirect("http://169.254.169.254/latest", 302),
    )
    mocks.checkSsrfSafety
      .mockResolvedValueOnce(safe)
      .mockResolvedValueOnce({ unsafe: true })

    expect(await codeOf(fetchFeed(input))).toBe("blocked")
    expect(mocks.checkSsrfSafety).toHaveBeenNthCalledWith(
      2,
      "http://169.254.169.254/latest",
    )
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(1)
  })

  test("follows redirects at most three times", async () => {
    mocks.pinnedGet.mockImplementation(async () =>
      Response.redirect("https://example.com/next", 301),
    )

    expect(await codeOf(fetchFeed(input))).toBe("tooManyRedirects")
    expect(mocks.pinnedGet).toHaveBeenCalledTimes(4)
  })

  test("treats 304 as success without a body", async () => {
    mocks.pinnedGet.mockResolvedValue(new Response(null, { status: 304 }))

    expect(await fetchFeed(input)).toEqual({ kind: "notModified" })
  })

  test("refuses a bad status and a non-XML content type", async () => {
    mocks.pinnedGet.mockResolvedValueOnce(xml("x", {}, 500))
    expect(await codeOf(fetchFeed(input))).toBe("badStatus")

    mocks.pinnedGet.mockResolvedValueOnce(
      xml("<html/>", { "content-type": "text/html" }),
    )
    expect(await codeOf(fetchFeed(input))).toBe("badContentType")
  })

  test("keeps the page of an HTML answer so a save can suggest its feed", async () => {
    mocks.pinnedGet.mockResolvedValueOnce(
      xml("<html><head></head></html>", { "content-type": "text/html" }),
    )
    const error = await fetchFeed(input).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(FeedFetchError)
    expect((error as InstanceType<typeof FeedFetchError>).html).toContain(
      "<head>",
    )
  })

  test("accepts the JSON Feed content types", async () => {
    for (const type of ["application/feed+json", "application/json"]) {
      mocks.pinnedGet.mockResolvedValueOnce(
        xml("{}", { "content-type": `${type}; charset=utf-8` }),
      )
      expect(await fetchFeed(input)).toMatchObject({ kind: "ok" })
    }
  })

  test("accepts the XML content types feeds use", async () => {
    for (const type of [
      "application/atom+xml; charset=utf-8",
      "text/xml",
      "application/xml",
    ]) {
      mocks.pinnedGet.mockResolvedValueOnce(
        xml("<feed/>", { "content-type": type }),
      )
      expect((await fetchFeed(input)).kind).toBe("ok")
    }
  })

  test("refuses a body over 2 MB, declared or streamed", async () => {
    mocks.pinnedGet.mockResolvedValueOnce(
      xml("x", { "content-length": String(3 * 1024 * 1024) }),
    )
    expect(await codeOf(fetchFeed(input))).toBe("tooLarge")

    mocks.pinnedGet.mockResolvedValueOnce(xml("a".repeat(2 * 1024 * 1024 + 1)))
    expect(await codeOf(fetchFeed(input))).toBe("tooLarge")
  })

  test("reports a connection failure as unreachable", async () => {
    mocks.pinnedGet.mockRejectedValue(new Error("ECONNREFUSED"))

    expect(await codeOf(fetchFeed(input))).toBe("unreachable")
  })

  test("gives up on a body that never finishes within the time budget", async () => {
    mocks.pinnedGet.mockImplementation(
      async ({ signal }: { signal: AbortSignal }) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<rss>"))
              signal.addEventListener("abort", () =>
                controller.error(new Error("aborted")),
              )
            },
          }),
          { headers: { "content-type": "application/rss+xml" } },
        ),
    )

    expect(await codeOf(fetchFeed(input))).toBe("timeout")
  })
})
