import { beforeEach, describe, expect, test, vi } from "vitest"

// Channel-scoped storage key the received media must land under.
const CHANNEL_MEDIA_KEY = /^public\/instagram\/ws-1\/int-1\/2026\/10\/06\//
const WORKSPACE_MEDIA_KEY = /^public\/ws\/ws-1\/2026\/10\/06\//

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock("cross-fetch", () => ({ default: mocks.fetch }))

const { getMessageAttachmentEntity } = await import("../src/apis/attachment")

const buildCtx = (prefixes: {
  storagePrefix: string
  mediaStoragePrefix?: string
}) =>
  ({
    ...prefixes,
    auth: { tokens: { accessToken: "page-token" } },
    uploader: { putObject: vi.fn(async () => undefined) },
  }) as never

const attachment = {
  type: "file",
  payload: { url: "https://cdn.example/file.pdf" },
} as never

describe("instagram-facebook received attachment storage", () => {
  beforeEach(() => {
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "application/pdf" },
      }),
    )
  })

  test("stores received media under the channel-scoped prefix", async () => {
    const result = await getMessageAttachmentEntity({
      ctx: buildCtx({
        storagePrefix: "public/ws/ws-1/2026/10/06",
        mediaStoragePrefix: "public/instagram/ws-1/int-1/2026/10/06",
      }),
      attachment,
    })

    expect(result?.originPath).toMatch(CHANNEL_MEDIA_KEY)
  })

  test("falls back to the workspace prefix when the context has no channel prefix", async () => {
    const result = await getMessageAttachmentEntity({
      ctx: buildCtx({ storagePrefix: "public/ws/ws-1/2026/10/06" }),
      attachment,
    })

    expect(result?.originPath).toMatch(WORKSPACE_MEDIA_KEY)
  })
})
