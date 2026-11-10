import { createHash } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  storeIncomingImage: vi.fn(),
}))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/utils/store-incoming-image")
  >()),
  storeIncomingImage: mocks.storeIncomingImage,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock("../src/client", () => ({ getWhatsappClient: vi.fn(() => ({})) }))

const {
  DEFAULT_FLOW_MEDIA_POLICY,
  extractFlowMediaGroups,
  ingestFlowMedia,
  readFlowResponseMedia,
} = await import("../src/handlers/message/incoming-flow-media")
const { receiveMessage } = await import(
  "../src/handlers/message/incomming-message"
)

const MEDIA_PREFIX = "public/whatsapp/ws-1/int-1/2026/10/06"
const PDF = "application/pdf"
const FAST_POLICY = {
  ...DEFAULT_FLOW_MEDIA_POLICY,
  retryDelayMs: 1,
  requestTimeoutMs: 1000,
}

const uploader = { putObject: vi.fn() }
const fetchMock =
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

/** The receiving number, sent as `phone_number_id` with every media lookup. */
const PHONE_NUMBER_ID = "555"

const buildCtx = (overrides: Record<string, unknown> = {}) =>
  ({
    auth: { tokens: { accessToken: "test-token" } },
    storagePrefix: "workspace-1",
    mediaStoragePrefix: MEDIA_PREFIX,
    uploader,
    integrationDetail: { phoneNumberId: PHONE_NUMBER_ID },
    ...overrides,
  }) as never

/** A stored file's key: the channel prefix, a random UUID, the clean name. */
const storedKey = (name: string) =>
  new RegExp(
    `^${MEDIA_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-${name.replace(/\./g, "\\.")}$`,
  )

const sha256Of = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("base64")

const BYTES = Buffer.from("flow-media-bytes")

const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  file_name: `${id}.pdf`,
  mime_type: PDF,
  sha256: sha256Of(BYTES),
  ...overrides,
})

const group = (key: string, ...ids: string[]) => ({
  key,
  entries: ids.map((id) => {
    const raw = entry(id)
    return {
      id: raw.id,
      fileName: raw.file_name,
      mimeType: raw.mime_type,
    }
  }),
})

const metadataUrl = (id: string) =>
  `https://graph.facebook.com/v23.0/${id}?phone_number_id=${PHONE_NUMBER_ID}`
const cdnUrl = (id: string) => `https://cdn.example.com/${id}`

const metadataResponse = (id: string, mimeType = PDF) =>
  Response.json({ id, url: cdnUrl(id), mime_type: mimeType })

const bytesResponse = (bytes: Buffer = BYTES) =>
  new Response(new Uint8Array(bytes))

/** One response per call; the last one repeats. */
const respondWith = (
  routes: Record<string, Array<() => Response | Promise<Response>>>,
) => {
  const calls = new Map<string, number>()
  fetchMock.mockImplementation((url) => {
    const queue = routes[url]
    if (!queue) {
      return Promise.resolve(new Response("not found", { status: 404 }))
    }
    const call = calls.get(url) ?? 0
    calls.set(url, call + 1)
    const respond = queue[Math.min(call, queue.length - 1)] as () =>
      | Response
      | Promise<Response>
    return Promise.resolve(respond())
  })
}

const serveFile = (id: string, bytes: Buffer = BYTES, mimeType = PDF) =>
  respondWith({
    [metadataUrl(id)]: [() => metadataResponse(id, mimeType)],
    [cdnUrl(id)]: [() => bytesResponse(bytes)],
  })

const callsTo = (url: string) =>
  fetchMock.mock.calls.filter(([called]) => called === url).length

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  mocks.storeIncomingImage.mockImplementation(
    async ({
      key,
      mimeType,
      bytes,
    }: {
      key: string
      mimeType: string
      bytes: Buffer
    }) => ({
      originPath: key,
      mimeType,
      size: bytes.length,
      optimized: false,
    }),
  )
})

describe("extractFlowMediaGroups", () => {
  test("recognises answers whose every item is an uploaded file", () => {
    expect(
      extractFlowMediaGroups({
        flow_token: "token",
        photo_picker: [entry("1"), entry("2")],
      }),
    ).toEqual([
      {
        key: "photo_picker",
        entries: [
          {
            id: "1",
            fileName: "1.pdf",
            mimeType: PDF,
          },
          {
            id: "2",
            fileName: "2.pdf",
            mimeType: PDF,
          },
        ],
      },
    ])
  })

  test("an item without sha256 is still an uploaded file", () => {
    expect(
      extractFlowMediaGroups({
        docs: [{ id: "1", file_name: "a.pdf", mime_type: PDF }],
      }),
    ).toEqual([
      { key: "docs", entries: [{ id: "1", fileName: "a.pdf", mimeType: PDF }] },
    ])
  })

  test("never mistakes ordinary answers for files", () => {
    expect(
      extractFlowMediaGroups({
        empty_multi_select: [],
        multi_select: ["a", "b"],
        mixed: [entry("1"), "b"],
        missing_type: [{ id: "1", file_name: "a.pdf" }],
        empty_id: [entry("", {})],
        object_answer: entry("1"),
        text: "hello",
        count: 3,
      }),
    ).toEqual([])
  })
})

describe("media ids", () => {
  test("a numeric id marks an uploaded file and is read as its digits", () => {
    expect(
      extractFlowMediaGroups({
        documents: [
          {
            id: 1_234_567_890_123,
            mime_type: PDF,
            sha256: sha256Of(BYTES),
            file_name: "contract.pdf",
          },
        ],
        flow_token: "token",
      }),
    ).toEqual([
      {
        key: "documents",
        entries: [
          { id: "1234567890123", fileName: "contract.pdf", mimeType: PDF },
        ],
      },
    ])
  })

  test.each([
    ["a fractional number", 1.5],
    ["a number beyond the safe integer range", 2 ** 53],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a boolean", true],
  ])("%s is not a media id", (_label, id) => {
    expect(
      extractFlowMediaGroups({
        docs: [{ id, file_name: "a.pdf", mime_type: PDF }],
      }),
    ).toEqual([])
  })

  test("any non-empty id marks an uploaded file (Meta documents no format)", () => {
    expect(
      extractFlowMediaGroups({
        letters: [entry("abc")],
        path: [entry("../1")],
      }),
    ).toEqual([
      {
        key: "letters",
        entries: [{ id: "abc", fileName: "abc.pdf", mimeType: PDF }],
      },
      {
        key: "path",
        entries: [{ id: "../1", fileName: "../1.pdf", mimeType: PDF }],
      },
    ])
  })

  test("the media id is encoded and pinned to the receiving number", async () => {
    const url = metadataUrl("a%2Fb")
    respondWith({ [url]: [() => new Response("", { status: 404 })] })

    await ingestFlowMedia(buildCtx(), [group("k", "a/b")], FAST_POLICY)

    expect(callsTo(url)).toBe(1)
  })

  test.each([
    ["no integration detail", { integrationDetail: undefined }],
    ["no phone number id", { integrationDetail: {} }],
  ])("without the receiving number (%s) nothing is fetched", async (_label, overrides) => {
    serveFile("1")

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(overrides),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(attachments).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("ingestFlowMedia", () => {
  test("stores a verified file under the channel prefix and describes it", async () => {
    serveFile("111")

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [
        {
          key: "docs",
          entries: [
            {
              id: "111",
              fileName: "Boarding Pass.PDF",
              mimeType: PDF,
            },
          ],
        },
      ],
      FAST_POLICY,
    )

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uploader,
        key: expect.stringMatching(storedKey("boarding-pass.pdf")),
        mimeType: PDF,
        profile: "original",
        acl: "public-read",
      }),
    )
    expect(files).toEqual({
      docs: [
        {
          status: "stored",
          mediaId: "111",
          fileName: "Boarding Pass.PDF",
          mimeType: PDF,
          size: BYTES.length,
        },
      ],
    })
    expect(attachments).toEqual([
      {
        sourceId: "111",
        fileType: "file",
        name: "Boarding Pass.PDF",
        originPath: expect.stringMatching(storedKey("boarding-pass.pdf")),
        mimeType: PDF,
        size: BYTES.length,
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      metadataUrl("111"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    )
  })

  test.each([
    ["image/png", "image"],
    ["video/mp4", "video"],
    ["application/zip", "file"],
  ])("%s becomes a %s attachment", async (mimeType, fileType) => {
    serveFile("1", BYTES, mimeType)

    const { attachments } = await ingestFlowMedia(
      buildCtx(),
      [
        {
          key: "k",
          entries: [
            {
              id: "1",
              fileName: "f",
              mimeType,
            },
          ],
        },
      ],
      FAST_POLICY,
    )

    expect(attachments[0]).toMatchObject({ fileType, mimeType })
  })

  test("a file is kept whatever its sha256 says: Meta does not document that hash", async () => {
    serveFile("1", Buffer.from("bytes that do not match"))

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(attachments).toHaveLength(1)
  })

  test("a file whose URL answers 404 is fetched again from a new URL", async () => {
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [
        () => new Response("", { status: 404 }),
        () => bytesResponse(),
      ],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(callsTo(metadataUrl("1"))).toBe(2)
    expect(callsTo(cdnUrl("1"))).toBe(2)
  })

  test("a file whose URL keeps answering 404 fails as download_failed", async () => {
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => new Response("", { status: 404 })],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
  })

  test("a declared type outside Meta's list is refused before any request", async () => {
    const { files } = await ingestFlowMedia(
      buildCtx(),
      [
        {
          key: "k",
          entries: [
            {
              id: "1",
              fileName: "page.html",
              mimeType: "text/html",
            },
          ],
        },
      ],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "unsupported_type",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("a type Meta reports for the media outside the list is refused", async () => {
    serveFile("1", BYTES, "text/html")

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "unsupported_type",
    })
    expect(callsTo(cdnUrl("1"))).toBe(0)
  })

  test("stops reading a file once it crosses the size cap", async () => {
    const onCancel = vi.fn()
    let pulled = 0
    const endlessBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(8))
      },
      cancel: onCancel,
    })
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => new Response(endlessBody)],
    })

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      maxFileBytes: 20,
    })

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "too_large",
    })
    expect(onCancel).toHaveBeenCalled()
    expect(pulled).toBeLessThan(10)
  })

  test("files past the per-response count are failed without being fetched", async () => {
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => bytesResponse()],
      [metadataUrl("2")]: [() => metadataResponse("2")],
      [cdnUrl("2")]: [() => bytesResponse()],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("a", "1", "2"), group("b", "3")],
      { ...FAST_POLICY, maxFiles: 2 },
    )

    expect(files.a?.map((file) => file.status)).toEqual(["stored", "stored"])
    expect(files.b?.[0]).toMatchObject({
      status: "failed",
      reason: "too_large",
    })
    expect(callsTo(metadataUrl("3"))).toBe(0)
  })

  test("the byte allowance is shared by every key of the response", async () => {
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => bytesResponse(Buffer.alloc(10, 1))],
      [metadataUrl("2")]: [() => metadataResponse("2")],
      [cdnUrl("2")]: [() => bytesResponse(Buffer.alloc(10, 1))],
    })
    const entryOf = (id: string) => ({
      id,
      fileName: id,
      mimeType: PDF,
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [
        { key: "a", entries: [entryOf("1")] },
        { key: "b", entries: [entryOf("2")] },
      ],
      { ...FAST_POLICY, concurrency: 1, maxTotalBytes: 15 },
    )

    expect(files.a?.[0]?.status).toBe("stored")
    expect(files.b?.[0]).toMatchObject({
      status: "failed",
      reason: "too_large",
    })
  })

  test("counts the bytes a file really had, not its cap", async () => {
    const small = Buffer.alloc(5, 1)
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => bytesResponse(small)],
      [metadataUrl("2")]: [() => metadataResponse("2")],
      [cdnUrl("2")]: [() => bytesResponse(small)],
    })
    const entryOf = (id: string) => ({
      id,
      fileName: id,
      mimeType: PDF,
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [{ key: "k", entries: [entryOf("1"), entryOf("2")] }],
      {
        ...FAST_POLICY,
        concurrency: 1,
        maxFileBytes: 10,
        maxTotalBytes: 12,
      },
    )

    expect(files.k?.map((file) => file.status)).toEqual(["stored", "stored"])
  })

  test("files fetched at the same time do not turn each other away", async () => {
    const body = Buffer.alloc(15, 1)
    const routes: Record<string, Array<() => Response>> = {}
    for (const id of ["1", "2", "3", "4", "5", "6"]) {
      routes[metadataUrl(id)] = [() => metadataResponse(id)]
      routes[cdnUrl(id)] = [() => bytesResponse(body)]
    }
    respondWith(routes)
    const entryOf = (id: string) => ({
      id,
      fileName: id,
      mimeType: PDF,
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [
        {
          key: "k",
          entries: ["1", "2", "3", "4", "5", "6"].map(entryOf),
        },
      ],
      {
        ...FAST_POLICY,
        concurrency: 6,
        maxFiles: 6,
        maxFileBytes: 25,
        maxTotalBytes: 100,
      },
    )

    expect(files.k?.map((file) => file.status)).toEqual([
      "stored",
      "stored",
      "stored",
      "stored",
      "stored",
      "stored",
    ])
  })

  test("responses ingested at the same time share one cap on files in memory", async () => {
    let inFlight = 0
    let maxInFlight = 0
    fetchMock.mockImplementation(async (url) => {
      const id = url.split("/").at(-1) ?? ""
      if (url.startsWith("https://graph.facebook.com")) {
        return metadataResponse(id)
      }
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return bytesResponse()
    })
    const response = (...ids: string[]) =>
      ingestFlowMedia(buildCtx(), [group("k", ...ids)], {
        ...FAST_POLICY,
        concurrency: 3,
      })

    const results = await Promise.all([
      response("1", "2", "3"),
      response("4", "5", "6"),
    ])

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(
      results.flatMap(({ files }) => files.k?.map((file) => file.status)),
    ).toEqual(Array.from({ length: 6 }, () => "stored"))
  })

  test("a file waiting for a slot fails when its response's deadline passes", async () => {
    fetchMock.mockImplementation(async (url) => {
      const id = url.split("/").at(-1) ?? ""
      if (url.startsWith("https://graph.facebook.com")) {
        return metadataResponse(id)
      }
      // Slow downloads keep every slot busy past the second response's deadline.
      await new Promise((resolve) => setTimeout(resolve, 200))
      return bytesResponse()
    })
    const busy = ingestFlowMedia(buildCtx(), [group("k", "1", "2", "3")], {
      ...FAST_POLICY,
      concurrency: 3,
    })
    const startedAt = Date.now()

    const late = await ingestFlowMedia(buildCtx(), [group("k", "4")], {
      ...FAST_POLICY,
      deadlineMs: 30,
    })

    expect(Date.now() - startedAt).toBeLessThan(150)
    expect(late.files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    await busy
  })

  test("a stalled upload fails the file within the response's deadline and is cancelled", async () => {
    serveFile("1")
    let uploadSignal: AbortSignal | undefined
    mocks.storeIncomingImage.mockImplementation(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        uploadSignal = abortSignal
        return new Promise<never>(() => undefined)
      },
    )
    const startedAt = Date.now()

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      { ...FAST_POLICY, deadlineMs: 50 },
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(attachments).toEqual([])
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(uploadSignal?.aborted).toBe(true)
  })

  test("a deadline that passed before storing fails the file without storing", async () => {
    serveFile("1")

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      deadlineMs: 0,
    })

    expect(files.k?.[0]).toMatchObject({ reason: "download_failed" })
    expect(mocks.storeIncomingImage).not.toHaveBeenCalled()
  })

  test("a 404 on the media id is a plain failure, not retried and not called gone", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 404 })],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("a throttled metadata request is tried again and succeeds", async () => {
    respondWith({
      [metadataUrl("1")]: [
        () =>
          new Response("", {
            status: 429,
            headers: { "retry-after": "0.001" },
          }),
        () => metadataResponse("1"),
      ],
      [cdnUrl("1")]: [() => bytesResponse()],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(callsTo(metadataUrl("1"))).toBe(2)
  })

  test("a file download that fails with a server error is tried again", async () => {
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [
        () => new Response("", { status: 503 }),
        () => bytesResponse(),
      ],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(callsTo(cdnUrl("1"))).toBe(2)
  })

  test("a server error that persists exhausts the attempts", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 500 })],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(FAST_POLICY.maxAttempts)
  })

  test("a refusal that retrying cannot fix is not retried", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 403 })],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("a Retry-After beyond the deadline ends the tries instead of ignoring it", async () => {
    respondWith({
      [metadataUrl("1")]: [
        () =>
          new Response("", { status: 429, headers: { "retry-after": "3600" } }),
        () => metadataResponse("1"),
      ],
      [cdnUrl("1")]: [() => bytesResponse()],
    })

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      deadlineMs: 5000,
    })

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("no try starts when its pause would pass the deadline", async () => {
    respondWith({
      [metadataUrl("1")]: [
        () => new Response("", { status: 503 }),
        () => metadataResponse("1"),
      ],
      [cdnUrl("1")]: [() => bytesResponse()],
    })

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      retryDelayMs: 60_000,
      deadlineMs: 5000,
    })

    expect(files.k?.[0]).toMatchObject({ reason: "download_failed" })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("a body cut short mid-stream is tried again", async () => {
    const brokenBody = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new TypeError("terminated"))
          },
        }),
      )
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [brokenBody, () => bytesResponse()],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(callsTo(cdnUrl("1"))).toBe(2)
  })

  test("a file still being fetched when the deadline passes fails instead of stalling", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 500 })],
    })

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      deadlineMs: 5,
      retryDelayMs: 30,
    })

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("a context without storage keeps nothing", async () => {
    serveFile("1")

    const { files, attachments } = await ingestFlowMedia(
      buildCtx({ uploader: undefined }),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(attachments).toEqual([])
  })

  test("one failed file does not stop the others", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 404 })],
      [metadataUrl("2")]: [() => metadataResponse("2")],
      [cdnUrl("2")]: [() => bytesResponse()],
    })

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1", "2")],
      FAST_POLICY,
    )

    expect(files.k?.map((file) => file.status)).toEqual(["failed", "stored"])
    expect(attachments).toHaveLength(1)
  })

  test("a hostile file name cannot reach the storage key or the display name", async () => {
    serveFile("1")

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [
        {
          key: "k",
          entries: [
            {
              id: "1",
              fileName: "../../etc/pass\u0000wd\\evil\u202e\u0085.pdf",
              mimeType: PDF,
            },
          ],
        },
      ],
      FAST_POLICY,
    )

    expect(attachments[0]?.originPath).toMatch(
      storedKey("etc-pass-wd-evil.pdf"),
    )
    expect(files.k?.[0]).toMatchObject({ fileName: "....etcpasswdevil.pdf" })
  })

  test("each download gets its own unguessable key", async () => {
    serveFile("1")

    const first = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )
    const second = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(second.attachments[0]?.originPath).not.toBe(
      first.attachments[0]?.originPath,
    )
    expect(first.attachments[0]?.originPath).not.toContain(`${MEDIA_PREFIX}/1-`)
    expect(callsTo(cdnUrl("1"))).toBe(2)
  })
})

describe("ingestFlowMedia edge cases", () => {
  test.each([
    [
      "error code 100 / subcode 33",
      { error: { code: 100, error_subcode: 33 } },
    ],
    ["another Graph error", { error: { code: 190, error_subcode: 463 } }],
    ["an unreadable body", "not json"],
  ])("a 400 with %s is a plain failure", async (_label, body) => {
    respondWith({
      [metadataUrl("1")]: [
        () =>
          new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status: 400,
          }),
      ],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(metadataUrl("1"))).toBe(1)
  })

  test("a failed response's body is released instead of left open", async () => {
    const onCancel = vi.fn()
    respondWith({
      [metadataUrl("1")]: [
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull: (controller) => controller.enqueue(new Uint8Array(1)),
              cancel: onCancel,
            }),
            { status: 503 },
          ),
      ],
    })

    await ingestFlowMedia(buildCtx(), [group("k", "1")], FAST_POLICY)

    expect(onCancel).toHaveBeenCalled()
  })

  test("a request that never answers is aborted and tried again", async () => {
    fetchMock.mockImplementation((url, init) => {
      if (url === metadataUrl("1")) {
        return Promise.resolve(metadataResponse("1"))
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        )
      })
    })

    const { files } = await ingestFlowMedia(buildCtx(), [group("k", "1")], {
      ...FAST_POLICY,
      requestTimeoutMs: 20,
    })

    expect(files.k?.[0]).toMatchObject({
      status: "failed",
      reason: "download_failed",
    })
    expect(callsTo(cdnUrl("1"))).toBe(FAST_POLICY.maxAttempts)
  })

  test("a network error is tried again and succeeds", async () => {
    let metadataCalls = 0
    fetchMock.mockImplementation((url) => {
      if (url === metadataUrl("1")) {
        metadataCalls += 1
        return metadataCalls === 1
          ? Promise.reject(new TypeError("fetch failed"))
          : Promise.resolve(metadataResponse("1"))
      }
      return Promise.resolve(bytesResponse())
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]?.status).toBe("stored")
    expect(metadataCalls).toBe(2)
  })

  test("a media id repeated in a response is fetched and attached once", async () => {
    serveFile("1")

    const { files, attachments } = await ingestFlowMedia(
      buildCtx(),
      [group("a", "1"), group("b", "1")],
      FAST_POLICY,
    )

    expect(files.a?.[0]).toMatchObject({ status: "stored", mediaId: "1" })
    expect(files.b?.[0]).toMatchObject({ status: "stored", mediaId: "1" })
    expect(attachments).toHaveLength(1)
    expect(callsTo(cdnUrl("1"))).toBe(1)
  })

  test("the first occurrence of a repeated media id decides its name", async () => {
    serveFile("1")
    const entryNamed = (fileName: string) => ({
      id: "1",
      fileName,
      mimeType: PDF,
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [
        { key: "a", entries: [entryNamed("first.pdf")] },
        { key: "b", entries: [entryNamed("second.pdf")] },
      ],
      FAST_POLICY,
    )

    expect(files.a?.[0]).toMatchObject({ fileName: "first.pdf" })
    expect(files.b?.[0]).toMatchObject({ fileName: "first.pdf" })
  })

  test.each([
    ["404", 404],
    ["410", 410],
  ])("the body of a %s response is released", async (_label, status) => {
    const onCancel = vi.fn()
    respondWith({
      [metadataUrl("1")]: [
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull: (controller) => controller.enqueue(new Uint8Array(1)),
              cancel: onCancel,
            }),
            { status },
          ),
      ],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({ reason: "download_failed" })
    expect(onCancel).toHaveBeenCalled()
  })

  test("a 400 from the file download is a plain failure and its body is not read", async () => {
    const body = new Response(
      JSON.stringify({ error: { code: 100, error_subcode: 33 } }),
      { status: 400 },
    )
    const json = vi.spyOn(body, "json")
    respondWith({
      [metadataUrl("1")]: [() => metadataResponse("1")],
      [cdnUrl("1")]: [() => body],
    })

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("k", "1")],
      FAST_POLICY,
    )

    expect(files.k?.[0]).toMatchObject({ reason: "download_failed" })
    expect(json).not.toHaveBeenCalled()
  })

  test("a response key named __proto__ keeps its files", async () => {
    serveFile("1")

    const { files } = await ingestFlowMedia(
      buildCtx(),
      [group("__proto__", "1")],
      FAST_POLICY,
    )

    expect(Object.keys(files)).toEqual(["__proto__"])
    expect(Object.getOwnPropertyDescriptor(files, "__proto__")?.value).toEqual([
      expect.objectContaining({ status: "stored", mediaId: "1" }),
    ])
  })
})

describe("readFlowResponseMedia", () => {
  const flowResponseEntity = (flowResponse: Record<string, unknown>) => ({
    type: "whatsapp_flow_response" as const,
    name: "flow",
    flowResponse,
    flowToken: "token",
    decoded: null,
  })

  test("adds the ingested files and one attachment per stored file", async () => {
    serveFile("1")
    const entity = flowResponseEntity({
      flow_token: "token",
      photo_picker: [entry("1")],
    })

    const result = await readFlowResponseMedia(buildCtx(), entity)

    expect(result.contentAttributes).toMatchObject({
      ...entity,
      files: { photo_picker: [{ status: "stored", mediaId: "1" }] },
    })
    expect(result.attachments).toHaveLength(1)
    // The raw answer is left as Meta sent it.
    expect(entity.flowResponse.photo_picker).toEqual([entry("1")])
  })

  test("downloads a file whose id arrives as a number", async () => {
    serveFile("1234567890123")
    const entity = flowResponseEntity({
      flow_token: "token",
      documents: [entry("1234567890123", { id: 1_234_567_890_123 })],
    })

    const result = await readFlowResponseMedia(buildCtx(), entity)

    expect(result.contentAttributes).toMatchObject({
      files: { documents: [{ status: "stored", mediaId: "1234567890123" }] },
    })
    expect(result.attachments).toHaveLength(1)
    expect(callsTo(metadataUrl("1234567890123"))).toBe(1)
  })

  test("keeps the message the response answers alongside the files", async () => {
    serveFile("1")
    const entity = {
      ...flowResponseEntity({ photo_picker: [entry("1")] }),
      contextMessageId: "wamid.sent-flow",
    }

    const result = await readFlowResponseMedia(buildCtx(), entity)

    expect(result.contentAttributes).toMatchObject({
      contextMessageId: "wamid.sent-flow",
      files: { photo_picker: [{ status: "stored" }] },
    })
  })

  test("keeps the response when no file could be stored", async () => {
    respondWith({
      [metadataUrl("1")]: [() => new Response("", { status: 404 })],
    })

    const result = await readFlowResponseMedia(
      buildCtx(),
      flowResponseEntity({ photo_picker: [entry("1")] }),
    )

    expect(result.contentAttributes).toMatchObject({
      files: {
        photo_picker: [{ status: "failed", reason: "download_failed" }],
      },
    })
    expect(result.attachments).toBeUndefined()
  })

  test.each([
    ["a response without files", flowResponseEntity({ name: "Test" })],
    ["a list answer", flowResponseEntity({ choices: ["a", "b"] })],
    ["another reply", { type: "list_reply", id: "a", title: "A" }],
    ["no content", undefined],
  ])("%s adds nothing", async (_label, contentAttributes) => {
    const result = await readFlowResponseMedia(
      buildCtx(),
      contentAttributes as never,
    )

    expect(result).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("an nfm_reply carrying uploaded files", () => {
  test("keeps the postback and attaches the stored files to the message", async () => {
    serveFile("1")

    const result = await receiveMessage({
      ctx: buildCtx(),
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "inbox-1",
        payload: {
          phoneID: "phone-1",
          from: "84900000001",
          name: "Alice",
          message: {
            id: "wamid.flow-media",
            type: "interactive",
            interactive: {
              type: "nfm_reply",
              nfm_reply: {
                name: "flow",
                body: "Sent",
                response_json: JSON.stringify({
                  flow_token: "token",
                  photo_picker: [entry("1")],
                }),
              },
            },
          },
        },
      },
    } as never)

    expect(result.message?.text).toBe("Sent")
    expect(result.message?.attachments).toHaveLength(1)
    expect(result.message?.attachments?.[0]).toMatchObject({
      sourceId: "1",
      fileType: "file",
    })
    expect(result.message?.contentAttributes).toMatchObject({
      type: "whatsapp_flow_response",
      files: { photo_picker: [{ status: "stored", mediaId: "1" }] },
    })
  })
})
