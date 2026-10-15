import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Instagram-via-Facebook downloads with `cross-fetch`, which msw does not
// intercept here: mock it the way the storage test does.
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock("cross-fetch", () => ({ default: mocks.fetch }))

const { receiveMessage } = await import(
  "../src/handlers/message/incoming-message"
)

// A webhook for a lazy channel keeps the provider's CDN URL and downloads
// nothing: the bytes are stored the first time something needs them.
const META_CDN_URL = "https://scontent.xx.fbcdn.net/v/t1/photo.jpg?sig=abc"
const THIRD_PARTY_URL = "https://media.giphy.test/sticker.gif"

// Channel-scoped storage key an eagerly downloaded attachment lands under.
const CHANNEL_MEDIA_KEY = /^public\/instagram\/ws-1\/int-1\/2026\/10\/06\//

// This integration reads the image size without a fallback, so the eager path
// needs real image bytes.
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
)

const putObject = vi.fn(async () => undefined)

function buildCtx() {
  return {
    storagePrefix: "workspace-1",
    mediaStoragePrefix: "public/instagram/ws-1/int-1/2026/10/06",
    uploader: { putObject },
    auth: {
      clientId: "app-123",
      tokens: { accessToken: "page-token" },
      metadata: {
        igId: "ig-123",
        igName: "Test IG",
        pageId: "page-123",
        version: "v23.0",
      },
    },
  } as never
}

function buildPayload(
  attachments: { type: string; payload: { url: string } }[],
) {
  return {
    object: "instagram",
    entry: [
      {
        id: "ig-123",
        time: 1_700_000_000,
        messaging: [
          {
            sender: { id: "user-1" },
            recipient: { id: "ig-123" },
            timestamp: 1_700_000_000,
            message: { mid: "mid-1", attachments },
          },
        ],
      },
    ],
  } as never
}

const receive = (attachments: { type: string; payload: { url: string } }[]) =>
  receiveMessage({
    ctx: buildCtx(),
    data: {
      integrationType: "instagram",
      integrationIdentifier: "ig-123",
      payload: buildPayload(attachments),
    },
  } as never)

describe("instagram-via-facebook lazy live media", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("keeps a Meta CDN photo as a pending reference without downloading it", async () => {
    const result = await receive([
      { type: "image", payload: { url: META_CDN_URL } },
    ])

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(result?.message?.attachments).toEqual([
      {
        sourceId: null,
        fileType: "image",
        mimeType: "image/jpeg",
        originPath: META_CDN_URL,
        size: 0,
        isPhotoMessage: true,
      },
    ])
  })

  test("keeps a document as a pending reference too, but not as a photo", async () => {
    const url = "https://scontent.xx.fbcdn.net/v/t1/contract.pdf"

    const result = await receive([{ type: "file", payload: { url } }])

    expect(putObject).not.toHaveBeenCalled()
    expect(result?.message?.attachments?.[0]).toMatchObject({
      sourceId: null,
      fileType: "file",
      mimeType: "application/pdf",
      originPath: url,
      isPhotoMessage: false,
    })
  })

  test("still downloads a sticker or GIF hosted outside Meta's CDN", async () => {
    mocks.fetch.mockImplementation(async () =>
      Promise.resolve(
        new Response(PNG_1X1, {
          headers: { "content-type": "image/png" },
        }),
      ),
    )

    const result = await receive([
      { type: "image", payload: { url: THIRD_PARTY_URL } },
    ])

    expect(putObject).toHaveBeenCalledTimes(1)
    expect(result?.message?.attachments?.[0]?.originPath).toMatch(
      CHANNEL_MEDIA_KEY,
    )
  })

  test("downloads everything again when the channel is taken off the lazy list", async () => {
    vi.stubEnv("LIVE_MEDIA_LAZY_CHANNELS", "")
    mocks.fetch.mockImplementation(async () =>
      Promise.resolve(
        new Response(PNG_1X1, {
          headers: { "content-type": "image/png" },
        }),
      ),
    )

    const result = await receive([
      { type: "image", payload: { url: META_CDN_URL } },
    ])

    expect(putObject).toHaveBeenCalledTimes(1)
    expect(result?.message?.attachments?.[0]?.originPath).toMatch(
      CHANNEL_MEDIA_KEY,
    )
  })

  test("lazy and eager attachments of one message are both kept, in order", async () => {
    mocks.fetch.mockImplementation(async () =>
      Promise.resolve(
        new Response(PNG_1X1, {
          headers: { "content-type": "image/png" },
        }),
      ),
    )

    const result = await receive([
      { type: "image", payload: { url: META_CDN_URL } },
      { type: "image", payload: { url: THIRD_PARTY_URL } },
    ])

    const attachments = result?.message?.attachments ?? []
    expect(attachments).toHaveLength(2)
    expect(attachments[0]?.originPath).toBe(META_CDN_URL)
    expect(attachments[1]?.originPath).toMatch(CHANNEL_MEDIA_KEY)
  })
})
