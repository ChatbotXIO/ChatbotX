import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  downloadWhatsappMedia: vi.fn(),
  readBodyWithCap: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

class MockAttachmentTooLargeError extends Error {}

vi.mock("../src/integration/handlers/coexist/attachment-download", () => ({
  AttachmentTooLargeError: MockAttachmentTooLargeError,
  downloadWhatsappMedia: mocks.downloadWhatsappMedia,
  readBodyWithCap: mocks.readBodyWithCap,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mocks.logger,
}))

const { downloadCallMedia, WhatsappCallMediaGoneError } = await import(
  "../src/integration/handlers/shared/whatsapp-call-native-media"
)

const auth = { tokens: { accessToken: "token-1" } } as never

const baseProps = {
  mediaId: "media-1",
  url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/audio.ogg",
  auth,
  fallbackMime: "audio/ogg",
  label: "call recording",
}

describe("downloadCallMedia", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  test("happy path: never touches the classify/fallback network calls", async () => {
    mocks.downloadWhatsappMedia.mockResolvedValue({
      bytes: new ArrayBuffer(4),
      mimeType: "audio/ogg",
      size: 4,
    })

    const result = await downloadCallMedia(baseProps)

    expect(result.size).toBe(4)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("AttachmentTooLargeError rethrows immediately — never classified or falls back", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(
      new MockAttachmentTooLargeError("too big"),
    )

    await expect(downloadCallMedia(baseProps)).rejects.toBeInstanceOf(
      MockAttachmentTooLargeError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("genuine 404 at the authoritative id lookup: throws WhatsappCallMediaGoneError, never touches the stale lookaside URL", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("no url"))
    fetchMock.mockResolvedValueOnce({ status: 404 })

    await expect(downloadCallMedia(baseProps)).rejects.toBeInstanceOf(
      WhatsappCallMediaGoneError,
    )
    // Only the classification GET ran — the lookaside URL fallback fetch
    // never fires once the id lookup is authoritatively "not found".
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain("media-1")
  })

  test("genuine 410 at the authoritative id lookup also classifies as gone", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("no url"))
    fetchMock.mockResolvedValueOnce({ status: 410 })

    await expect(downloadCallMedia(baseProps)).rejects.toBeInstanceOf(
      WhatsappCallMediaGoneError,
    )
  })

  test("a transient id-path failure (5xx/timeout/network) falls back to the lookaside URL and resolves on success", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("network blip"))
    // The classification lookup itself reports a transient status.
    fetchMock.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({
      ok: true,
      body: {},
      status: 200,
      headers: { get: () => "audio/ogg" },
    })
    mocks.readBodyWithCap.mockResolvedValue(new ArrayBuffer(8))

    const result = await downloadCallMedia(baseProps)

    expect(result.size).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("a transient id-path failure whose fallback URL ALSO 404s (staleness) rethrows a plain (retryable) Error, never MediaGone", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("network blip"))
    fetchMock
      .mockResolvedValueOnce({ status: 503 }) // classification: transient
      .mockResolvedValueOnce({ status: 404 }) // stale lookaside URL: NOT authoritative

    await expect(downloadCallMedia(baseProps)).rejects.not.toBeInstanceOf(
      WhatsappCallMediaGoneError,
    )
  })

  test("a network failure on the classification call itself is inconclusive — treated as transient, not gone", async () => {
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("network blip"))
    fetchMock.mockRejectedValueOnce(new Error("DNS failure")) // classify call itself fails
    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: {},
      status: 200,
      headers: { get: () => "audio/ogg" },
    })
    mocks.readBodyWithCap.mockResolvedValue(new ArrayBuffer(2))

    const result = await downloadCallMedia(baseProps)

    expect(result.size).toBe(2)
  })
})

describe("downloadCallMedia — download URL host allow-list", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    // The id path always fails here so every case reaches the URL fallback,
    // and the classification call reports "transient" so the failure can
    // only come from the URL check itself.
    mocks.downloadWhatsappMedia.mockRejectedValue(new Error("id path down"))
    fetchMock.mockResolvedValue({ status: 503 })
  })

  const expectRejectedUrl = async (url: string) => {
    await expect(
      downloadCallMedia({ ...baseProps, url }),
    ).rejects.toBeInstanceOf(WhatsappCallMediaGoneError)
    // The access token must never have been sent anywhere but the
    // classification call.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }

  test("refuses an attacker-controlled host, so the access token is never sent there", async () => {
    await expectRejectedUrl("https://evil.example.com/audio.ogg")
  })

  test("refuses a host that merely ends with a Meta host as a substring", async () => {
    await expectRejectedUrl("https://notlookaside.fbsbx.com.evil.test/a.ogg")
  })

  test("refuses plain http even on an allowed host", async () => {
    await expectRejectedUrl("http://lookaside.fbsbx.com/a.ogg")
  })

  test("refuses a malformed URL", async () => {
    await expectRejectedUrl("not-a-url")
  })

  test("accepts a subdomain of an allowed Meta host", async () => {
    fetchMock.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({
      ok: true,
      body: {},
      status: 200,
      headers: { get: () => "audio/ogg" },
    })
    mocks.readBodyWithCap.mockResolvedValue(new ArrayBuffer(3))

    const result = await downloadCallMedia({
      ...baseProps,
      url: "https://scontent.lookaside.fbsbx.com/a.ogg",
    })

    expect(result.size).toBe(3)
  })

  test("accepts the Graph host", async () => {
    fetchMock.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({
      ok: true,
      body: {},
      status: 200,
      headers: { get: () => "audio/ogg" },
    })
    mocks.readBodyWithCap.mockResolvedValue(new ArrayBuffer(4))

    const result = await downloadCallMedia({
      ...baseProps,
      url: "https://graph.facebook.com/v23.0/media-1",
    })

    expect(result.size).toBe(4)
  })
})
