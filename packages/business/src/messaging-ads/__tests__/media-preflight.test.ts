import { Readable } from "node:stream"
import { MAX_MESSAGING_AD_IMAGE_BYTES } from "@chatbotx.io/integration-facebook-ads"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// resolveStoredImageBytes — the bounded, ownership-verified read-back run at
// the START of runCreateSteps(), before ANY Graph call. Every rejection path
// below must fire withOUT touching `uploader.getObject` (the buffering read)
// when the size check alone should have stopped it, and without ever calling
// a Graph/integration mock (there isn't one in scope — the point is these
// checks are pure DB + storage, no Meta dependency at all).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  headObject: vi.fn(),
  getObjectStream: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  fileRepository: { findByIdForWorkspace: mocks.findByIdForWorkspace },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    headObject: mocks.headObject,
    getObjectStream: mocks.getObjectStream,
  },
}))

/** A single-chunk Readable of `buffer` — mirrors S3's streamed object body. */
function streamOf(buffer: Buffer) {
  return { stream: Readable.from([buffer]), contentLength: buffer.length }
}

const { resolveStoredImageBytes } = await import("../media-preflight")

const WORKSPACE_ID = "ws_1"
const IMAGE_KEY = "public/space/ws_1/ads-campaign/creatives/abc123"
const FILE_ID = "file_1"

function storedImageMedia(overrides: Partial<{ imageKey: string }> = {}) {
  return {
    kind: "image" as const,
    imageKey: overrides.imageKey ?? IMAGE_KEY,
    fileId: FILE_ID,
    link: "https://example.com",
  }
}

// A well-known minimal valid 1x1 transparent PNG fixture — `image-size`
// sniffs its magic bytes + IHDR chunk, so it must be a real (small) PNG, not
// an arbitrary byte string.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

const NOT_OWNED_ERROR = /not owned by this workspace/
const NOT_VERIFIED_ERROR = /could not be verified/
const TOO_LARGE_ERROR = /exceeds the maximum allowed size/
const NOT_FOUND_ERROR = /could not be found in storage/
const NOT_AN_IMAGE_ERROR = /not a supported image/
const NON_STORED_IMAGE_ERROR = /non-stored-image media/

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIdForWorkspace.mockResolvedValue({
    id: FILE_ID,
    workspaceId: WORKSPACE_ID,
    path: IMAGE_KEY,
    subType: "adsCampaignCreative",
  })
  mocks.headObject.mockResolvedValue({ ContentLength: PNG_BYTES.length })
  mocks.getObjectStream.mockResolvedValue(streamOf(PNG_BYTES))
})

describe("resolveStoredImageBytes — happy path", () => {
  test("resolves bytes + sniffed MIME + a server-generated filename", async () => {
    const result = await resolveStoredImageBytes({
      workspaceId: WORKSPACE_ID,
      media: storedImageMedia(),
    })

    expect(result.mimeType).toBe("image/png")
    expect(result.fileName).toBe(`${FILE_ID}.png`)
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    // headObject (size only) must run strictly BEFORE getObject (buffers
    // the whole object) — never the reverse.
    expect(mocks.headObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getObjectStream.mock.invocationCallOrder[0],
    )
  })
})

describe("resolveStoredImageBytes — rejections happen BEFORE any bytes are buffered", () => {
  test("rejects a key outside this workspace's namespace — never even queries the File row", async () => {
    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia({
          imageKey: "public/space/ws_evil/ads-campaign/creatives/abc123",
        }),
      }),
    ).rejects.toThrow(NOT_OWNED_ERROR)

    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
    expect(mocks.headObject).not.toHaveBeenCalled()
    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects when the File row does not exist (foreign/forged fileId)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(null)

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(NOT_VERIFIED_ERROR)

    expect(mocks.headObject).not.toHaveBeenCalled()
    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects when the File row's path does not match the submitted imageKey", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: FILE_ID,
      workspaceId: WORKSPACE_ID,
      path: "public/space/ws_1/ads-campaign/creatives/different-object",
      subType: "adsCampaignCreative",
    })

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(NOT_VERIFIED_ERROR)

    expect(mocks.headObject).not.toHaveBeenCalled()
  })

  test("rejects when the File row was minted for a different upload kind (contextType/subType mismatch)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      id: FILE_ID,
      workspaceId: WORKSPACE_ID,
      path: IMAGE_KEY,
      subType: "generic",
    })

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(NOT_VERIFIED_ERROR)

    expect(mocks.headObject).not.toHaveBeenCalled()
  })

  test("rejects an oversized object via headObject alone — getObject (buffering) is NEVER called", async () => {
    mocks.headObject.mockResolvedValue({ ContentLength: 50 * 1024 * 1024 })

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(TOO_LARGE_ERROR)

    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects a missing/never-uploaded object (headObject throws, e.g. 404)", async () => {
    mocks.headObject.mockRejectedValue(new Error("NotFound"))

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(NOT_FOUND_ERROR)

    expect(mocks.getObjectStream).not.toHaveBeenCalled()
  })

  test("rejects a body that exceeds the cap DURING the read even though headObject reported a small size (TOCTOU / post-HEAD overwrite)", async () => {
    // headObject passes (attacker-reported small size) but the key was swapped
    // for a giant object before getObjectStream — the bounded read must reject
    // rather than buffer it whole into memory.
    mocks.headObject.mockResolvedValue({ ContentLength: 100 })
    mocks.getObjectStream.mockResolvedValue(
      streamOf(Buffer.alloc(MAX_MESSAGING_AD_IMAGE_BYTES + 1)),
    )

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(TOO_LARGE_ERROR)
  })

  test("rejects a non-image file even though headObject/size passed (magic-byte sniff fails)", async () => {
    const notAnImage = Buffer.from("not a real image file")
    mocks.headObject.mockResolvedValue({ ContentLength: notAnImage.length })
    mocks.getObjectStream.mockResolvedValue(streamOf(notAnImage))

    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: storedImageMedia(),
      }),
    ).rejects.toThrow(NOT_AN_IMAGE_ERROR)
  })
})

describe("resolveStoredImageBytes — programming-error guard", () => {
  test("throws (not a ChatbotXException) when called for a non-stored-image media input", async () => {
    await expect(
      resolveStoredImageBytes({
        workspaceId: WORKSPACE_ID,
        media: {
          kind: "image",
          imageHash: "legacy_hash",
          link: "https://x.com",
        },
      }),
    ).rejects.toThrow(NON_STORED_IMAGE_ERROR)
  })
})
