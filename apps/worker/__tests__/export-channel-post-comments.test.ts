import { PassThrough } from "node:stream"
import {
  AuthException,
  ChannelError,
  ChannelErrorCategory,
} from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chunks: [] as string[],
  complete: vi.fn(),
  createUpload: vi.fn(),
  fail: vi.fn(),
  hasChannelHandler: vi.fn(),
  isBlocked: vi.fn(),
  isPending: vi.fn(),
  maxDurationMs: 60_000,
  beginRun: vi.fn(),
  listComments: vi.fn(),
  recordProgress: vi.fn(),
  resolvePostIntegration: vi.fn(),
  resolveTargets: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const rows = await import(
    "../../../packages/business/src/channel-post/export-rows"
  )
  const kinds = await import(
    "../../../packages/business/src/channel-post/export-kinds"
  )
  return {
    CHANNEL_POST_EXPORT_KINDS: kinds.CHANNEL_POST_EXPORT_KINDS,
    CHANNEL_POST_EXPORT_MAX_DISTINCT_VALUES: 2,
    get CHANNEL_POST_EXPORT_MAX_DURATION_MS() {
      return mocks.maxDurationMs
    },
    CHANNEL_POST_EXPORT_MAX_PAGES_PER_POST: 3,
    CHANNEL_POST_EXPORT_MAX_ROWS: 5,
    CHANNEL_POST_EXPORT_PROGRESS_INTERVAL_MS: 5000,
    CHANNEL_ROW_BUILDERS: rows.CHANNEL_ROW_BUILDERS,
    channelPostCommentExportService: {
      complete: mocks.complete,
      fail: mocks.fail,
      isPending: mocks.isPending,
      beginRun: mocks.beginRun,
      recordProgress: mocks.recordProgress,
      resolveTargets: mocks.resolveTargets,
    },
    keepEarliestRow: rows.keepEarliestRow,
  }
})

vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  createUpload: (...args: unknown[]) => mocks.createUpload(...args),
}))

vi.mock("../src/channel-post-sync/resolve-post-integration", () => ({
  resolvePostIntegration: (...args: unknown[]) =>
    mocks.resolvePostIntegration(...args),
}))

vi.mock("@chatbotx.io/channel-registry", () => ({
  INTEGRATION_AUTH_MISSING_CODE: "integration_auth_missing",
}))

// A provider rate-limit is signalled here by a `rateLimited` flag on the error.
vi.mock("@chatbotx.io/integration-messenger", async () => {
  const sdk = await import("@chatbotx.io/sdk")
  return {
    mapToChannelError: (error: unknown) =>
      (error as { rateLimited?: boolean }).rateLimited
        ? new sdk.ChannelError("limit", sdk.ChannelErrorCategory.RATE_LIMITED)
        : new sdk.ChannelError("x", sdk.ChannelErrorCategory.UNKNOWN),
  }
})
vi.mock("@chatbotx.io/integration-instagram", () => ({
  mapToChannelError: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  mapToChannelError: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-threads", () => ({
  mapToChannelError: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  mapToChannelError: vi.fn(),
}))

vi.mock(
  "../src/integration/handlers/shared/http-retry",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/integration/handlers/shared/http-retry")
    >()),
    withInlineRetry: <T>(fn: () => Promise<T>) => fn(),
  }),
)

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: (...args: unknown[]) => mocks.isBlocked(...args),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

const { exportChannelPostComments } = await import(
  "../src/default/handlers/export-channel-post-comments"
)

const data = (overrides: Record<string, unknown> = {}) =>
  ({
    canViewEmailAndPhone: true,
    fileId: "file-1",
    kind: "comments",
    outputPath: "workspaces/ws-1/exports/channel-posts/comments_file-1.csv",
    postIds: ["p1"],
    workspaceId: "ws-1",
    ...overrides,
  }) as Parameters<typeof exportChannelPostComments>[0]

const target = (id: string, inboxId = "inbox-1") => ({
  channel: "messenger",
  externalPostId: `ext-${id}`,
  id,
  inboxId,
  label: `Post ${id}`,
})

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  author: { id: `a-${id}`, name: `Name ${id}` },
  createdAt: new Date(`2026-11-22T10:0${id}:00.000Z`),
  fromOwner: false,
  hidden: false,
  id,
  parentId: null,
  text: `text ${id}`,
  ...overrides,
})

const page = (ids: string[], nextCursor: string | null = null) => ({
  items: ids.map((id) => item(id)),
  nextCursor,
})

const setupUpload = () => {
  mocks.chunks = []
  const stream = new PassThrough()
  stream.on("data", (chunk) => mocks.chunks.push(chunk.toString()))
  // A destroyed (aborted) stream never finishes: its upload is rejected, as S3's would be.
  const done = new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("close", () => reject(new Error("upload aborted")))
  })
  mocks.createUpload.mockReturnValue({ done, stream })
}

const csv = () => mocks.chunks.join("")
const csvLines = () => csv().replace("﻿", "").trimEnd().split("\n")

beforeEach(() => {
  vi.clearAllMocks()
  setupUpload()
  mocks.maxDurationMs = 60_000
  mocks.isPending.mockResolvedValue(true)
  mocks.isBlocked.mockResolvedValue(false)
  mocks.beginRun.mockResolvedValue(true)
  mocks.resolveTargets.mockResolvedValue([target("p1")])
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.resolvePostIntegration.mockImplementation(
    async (input: { inboxId: string }) => ({
      channel: "messenger",
      ctx: { inboxId: input.inboxId },
      integration: {
        hasChannelHandler: mocks.hasChannelHandler,
        runChannelHandler: mocks.listComments,
      },
    }),
  )
  mocks.listComments.mockResolvedValue(page(["1"]))
  mocks.complete.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.recordProgress.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("exportChannelPostComments — success", () => {
  test("reads every page until the cursor ends and writes a BOM, a header and one chunk per page", async () => {
    mocks.listComments
      .mockResolvedValueOnce(page(["1", "2"], "c2"))
      .mockResolvedValueOnce(page(["3"]))

    await exportChannelPostComments(data())

    expect(csv().startsWith("﻿")).toBe(true)
    expect(csvLines()).toEqual([
      '"createdAt","post","customer","phone","text","hidden"',
      '"2026-11-22T10:01:00.000Z","Post p1","Name 1","","text 1","false"',
      '"2026-11-22T10:02:00.000Z","Post p1","Name 2","","text 2","false"',
      '"2026-11-22T10:03:00.000Z","Post p1","Name 3","","text 3","false"',
    ])
    expect(mocks.listComments).toHaveBeenNthCalledWith(
      1,
      "post",
      "listComments",
      { ctx: expect.anything(), data: { cursor: undefined, postId: "ext-p1" } },
    )
    expect(mocks.listComments).toHaveBeenNthCalledWith(
      2,
      "post",
      "listComments",
      { ctx: expect.anything(), data: { cursor: "c2", postId: "ext-p1" } },
    )
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        rowCount: 3,
        truncated: false,
        workspaceId: "ws-1",
      }),
    )
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("merged posts on two inboxes are read one after another, each through its own integration", async () => {
    mocks.resolveTargets.mockResolvedValue([
      target("p1", "inbox-1"),
      target("p2", "inbox-2"),
    ])
    mocks.listComments
      .mockResolvedValueOnce(page(["1"]))
      .mockResolvedValueOnce(page(["2"]))

    await exportChannelPostComments(data({ postIds: ["p1", "p2"] }))

    expect(
      mocks.resolvePostIntegration.mock.calls.map(([input]) => input),
    ).toEqual([
      { channel: "messenger", inboxId: "inbox-1", workspaceId: "ws-1" },
      { channel: "messenger", inboxId: "inbox-2", workspaceId: "ws-1" },
    ])
    expect(csvLines()[1]).toContain('"Post p1"')
    expect(csvLines()[2]).toContain('"Post p2"')
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2 }),
    )
  })

  test("zero rows still finishes as uploaded with a header-only file", async () => {
    mocks.listComments.mockResolvedValue(page([]))

    await exportChannelPostComments(data())

    expect(csvLines()).toHaveLength(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 0, truncated: false }),
    )
  })

  test("a job that runs again after the file settled reads nothing", async () => {
    mocks.beginRun.mockResolvedValue(false)

    await exportChannelPostComments(data())

    expect(mocks.createUpload).not.toHaveBeenCalled()
    expect(mocks.listComments).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("without the permission the text is masked and no phone column is filled", async () => {
    mocks.listComments.mockResolvedValue({
      items: [item("1", { text: "call 0901234567" })],
      nextCursor: null,
    })

    await exportChannelPostComments(data({ canViewEmailAndPhone: false }))

    expect(csv()).not.toContain("0901234567")
  })
})

describe("exportChannelPostComments — phones and emails", () => {
  test("phones: one row per distinct number from the text, the earliest comment's, written at the end", async () => {
    mocks.listComments.mockResolvedValueOnce({
      items: [
        item("3", { text: "0901234567" }),
        item("1", { text: "0901234567" }),
        item("2", { fromOwner: true, text: "0999999999" }),
        item("4", { text: "no number" }),
      ],
      nextCursor: null,
    })

    await exportChannelPostComments(data({ kind: "phones" }))

    expect(csvLines()).toEqual([
      '"customer","phone","firstCommentAt","post"',
      '"Name 1","0901234567","2026-11-22T10:01:00.000Z","Post p1"',
    ])
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1 }),
    )
  })

  test("emails: lower-cased and deduplicated across posts", async () => {
    mocks.resolveTargets.mockResolvedValue([target("p1"), target("p2")])
    mocks.listComments
      .mockResolvedValueOnce({
        items: [item("2", { text: "A@X.io" })],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [item("1", { text: "a@x.io" })],
        nextCursor: null,
      })

    await exportChannelPostComments(
      data({ kind: "emails", postIds: ["p1", "p2"] }),
    )

    expect(csvLines()).toEqual([
      '"customer","email","firstCommentAt","post"',
      '"Name 1","a@x.io","2026-11-22T10:01:00.000Z","Post p2"',
    ])
  })
})

describe("exportChannelPostComments — ceilings end the file as truncated", () => {
  test("the row ceiling cuts the page and stops reading", async () => {
    mocks.listComments.mockResolvedValue(
      page(["1", "2", "3", "4"], "next-page"),
    )

    await exportChannelPostComments(data())

    expect(csvLines()).toHaveLength(1 + 5)
    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 5, truncated: true }),
    )
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("a page that exactly fills the row ceiling with more to read is truncated", async () => {
    mocks.listComments.mockResolvedValue(
      page(["1", "2", "3", "4", "5"], "more"),
    )

    await exportChannelPostComments(data())

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 5, truncated: true }),
    )
  })

  test("a last page that exactly fills the ceiling with nothing left is complete", async () => {
    mocks.listComments.mockResolvedValue(page(["1", "2", "3", "4", "5"]))

    await exportChannelPostComments(data())

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 5, truncated: false }),
    )
  })

  test("a ceiling filled by the first post while another post is left is truncated", async () => {
    mocks.resolveTargets.mockResolvedValue([target("p1"), target("p2")])
    mocks.listComments.mockResolvedValue(page(["1", "2", "3", "4", "5"]))

    await exportChannelPostComments(data({ postIds: ["p1", "p2"] }))

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ truncated: true }),
    )
  })

  test("the page ceiling per post moves on to the next post", async () => {
    mocks.resolveTargets.mockResolvedValue([target("p1"), target("p2")])
    mocks.listComments.mockImplementation(
      async (
        _group: string,
        _name: string,
        input: { data: { postId: string } },
      ) => (input.data.postId === "ext-p1" ? page(["1"], "more") : page(["2"])),
    )

    await exportChannelPostComments(data({ postIds: ["p1", "p2"] }))

    // Three pages of p1, one of p2.
    expect(mocks.listComments).toHaveBeenCalledTimes(4)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ truncated: true }),
    )
  })

  test("the wall-time ceiling stops the read and keeps what was written", async () => {
    let now = 1_000_000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.listComments.mockImplementation(() => {
      now += 61_000
      return Promise.resolve(page(["1"], "more"))
    })

    await exportChannelPostComments(data())

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1, truncated: true }),
    )
  })

  test("the distinct-value ceiling stops a phones export", async () => {
    mocks.listComments.mockResolvedValue({
      items: [
        item("1", { text: "0901111111" }),
        item("2", { text: "0902222222" }),
        item("3", { text: "0903333333" }),
      ],
      nextCursor: "more",
    })

    await exportChannelPostComments(data({ kind: "phones" }))

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2, truncated: true }),
    )
  })
})

describe("exportChannelPostComments — settling races", () => {
  test("a job picked up late that finishes long after the file was created still uploads and completes", async () => {
    let now = 1_000_000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.listComments.mockImplementation(() => {
      // Slow channel, but inside the 60 s test ceiling per call.
      now += 40_000
      return Promise.resolve(page(["1"]))
    })

    await exportChannelPostComments(data())

    // The job stamped its pickup and only the raw pending status was consulted.
    expect(mocks.beginRun).toHaveBeenCalledWith({
      fileId: "file-1",
      workspaceId: "ws-1",
    })
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("a file purged (or settled) while it ran is aborted, never finished or settled", async () => {
    mocks.isPending.mockResolvedValue(false)

    await exportChannelPostComments(data())

    const upload = mocks.createUpload.mock.results[0]?.value as {
      stream: PassThrough
    }
    expect(upload.stream.destroyed).toBe(true)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("an owner blocked while it ran is aborted and the file failed", async () => {
    mocks.isBlocked.mockResolvedValue(true)

    await exportChannelPostComments(data())

    const upload = mocks.createUpload.mock.results[0]?.value as {
      stream: PassThrough
    }
    expect(upload.stream.destroyed).toBe(true)
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1", reason: "failed" }),
    )
  })
})

describe("exportChannelPostComments — progress", () => {
  test("is saved at most every five seconds", async () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.listComments
      .mockImplementationOnce(() => {
        now += 1000
        return Promise.resolve(page(["1"], "c2"))
      })
      .mockImplementationOnce(() => {
        now += 1000
        return Promise.resolve(page(["2"], "c3"))
      })
      .mockImplementationOnce(() => {
        now += 4000
        return Promise.resolve(page(["3"]))
      })

    await exportChannelPostComments(data())

    expect(mocks.recordProgress).toHaveBeenCalledTimes(1)
    expect(mocks.recordProgress).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      fileId: "file-1",
      kind: "comments",
      postIds: ["p1"],
      rowCount: 3,
      workspaceId: "ws-1",
    })
  })
})

describe("exportChannelPostComments — lost start lock", () => {
  test("a progress save that lost the lock aborts the upload and fails the file, uploading and charging nothing", async () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.recordProgress.mockResolvedValue(false)
    mocks.listComments.mockImplementationOnce(() => {
      now += 6000
      return Promise.resolve(page(["1"], "c2"))
    })

    await exportChannelPostComments(data())

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1", reason: "failed" }),
    )
  })
})

describe("exportChannelPostComments — usage pacing", () => {
  const paused = (
    ids: string[],
    nextCursor: string | null,
    pauseMs: number,
  ) => ({
    ...page(ids, nextCursor),
    pauseMs,
  })

  test("waits the pause the channel asked for before the next read", async () => {
    vi.useFakeTimers()
    mocks.listComments
      .mockResolvedValueOnce(paused(["1"], "c2", 20_000))
      .mockResolvedValueOnce(page(["2"]))

    const run = exportChannelPostComments(data())
    await vi.advanceTimersByTimeAsync(19_000)
    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await run

    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2, truncated: false }),
    )
  })

  test("the pause carries over to the first read of the next post", async () => {
    vi.useFakeTimers()
    mocks.resolveTargets.mockResolvedValue([target("p1"), target("p2")])
    mocks.listComments
      .mockResolvedValueOnce(paused(["1"], null, 10_000))
      .mockResolvedValueOnce(page(["2"]))

    const run = exportChannelPostComments(data({ postIds: ["p1", "p2"] }))
    await vi.advanceTimersByTimeAsync(9000)
    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await run

    expect(mocks.listComments).toHaveBeenCalledTimes(2)
  })

  test("a null or absent hint does not wait", async () => {
    mocks.listComments
      .mockResolvedValueOnce({ ...page(["1"], "c2"), pauseMs: null })
      .mockResolvedValueOnce(page(["2"]))

    await exportChannelPostComments(data())

    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2 }),
    )
  })

  test("a pause that outlasts the wall-time ceiling ends the export as truncated, without waiting", async () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.listComments.mockImplementationOnce(() => {
      now += 29 * 60 * 1000
      return Promise.resolve(paused(["1"], "c2", 5 * 60 * 1000))
    })

    await exportChannelPostComments(data())

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1, truncated: true }),
    )
  })
})

describe("exportChannelPostComments — rate limits", () => {
  const rateLimited = Object.assign(new Error("slow down"), {
    rateLimited: true,
  })

  test("a page that is rate limited is read again after a wait, on the same cursor", async () => {
    vi.useFakeTimers()
    mocks.listComments
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce(page(["1"]))

    const run = exportChannelPostComments(data())
    await vi.advanceTimersByTimeAsync(5000)
    await run

    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1 }),
    )
  })

  test("a limit that outlasts every wait ends the export as rateLimited", async () => {
    vi.useFakeTimers()
    // Room for every backoff: the ceiling is not what ends this export.
    mocks.maxDurationMs = 10 * 60_000
    mocks.listComments.mockRejectedValue(rateLimited)

    const run = exportChannelPostComments(data())
    await vi.advanceTimersByTimeAsync(5000 + 15_000 + 45_000)
    await run

    expect(mocks.listComments).toHaveBeenCalledTimes(4)
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "rateLimited" }),
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})

describe("exportChannelPostComments — rate limits near the ceiling", () => {
  const rateLimited = Object.assign(new Error("slow down"), {
    rateLimited: true,
  })

  test("a limit whose wait would pass the ceiling ends the file as truncated with the rows already read, never failed", async () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    mocks.listComments
      .mockImplementationOnce(() => {
        now += 58_000
        return Promise.resolve(page(["1"], "c2"))
      })
      .mockRejectedValue(rateLimited)

    await exportChannelPostComments(data())

    // The 5 s backoff would end at 63 s: past the 60 s ceiling, so no wait, no retry.
    expect(mocks.listComments).toHaveBeenCalledTimes(2)
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1, truncated: true }),
    )
  })
})

describe("exportChannelPostComments — an abort that fails", () => {
  test("is logged and the file is still failed with its reason, which frees the lock", async () => {
    const upload = mocks.createUpload() as { stream: PassThrough }
    upload.stream.destroy = () => {
      throw new Error("abort failed")
    }
    mocks.listComments.mockRejectedValue(new AuthException("expired", 190, 401))

    await exportChannelPostComments(data())

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), fileId: "file-1" }),
      "channelPostExport: could not abort the upload",
    )
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        reason: "channelDisconnected",
      }),
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("a settled-elsewhere file whose abort fails is still handed to the blocked-owner settle", async () => {
    const upload = mocks.createUpload() as { stream: PassThrough }
    upload.stream.destroy = () => {
      throw new Error("abort failed")
    }
    mocks.isPending.mockResolvedValue(false)

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1", reason: "failed" }),
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})

describe("exportChannelPostComments — failures", () => {
  test("a post removed since the start fails the file as postNotFound before reading", async () => {
    mocks.resolveTargets.mockResolvedValue([])

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "postNotFound" }),
    )
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("a disconnected integration fails the file as channelDisconnected", async () => {
    mocks.resolvePostIntegration.mockRejectedValue(
      new ChannelError("no auth", ChannelErrorCategory.AUTH_FAILED, {
        code: "integration_auth_missing",
      }),
    )

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "channelDisconnected" }),
    )
  })

  test("an authorisation error that survived the integration's own refresh is channelDisconnected", async () => {
    mocks.listComments.mockRejectedValue(new AuthException("token revoked"))

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "channelDisconnected" }),
    )
    // Not swallowed or retried here: the integration's refresh ran inside runChannelHandler.
    expect(mocks.listComments).toHaveBeenCalledTimes(1)
  })

  test("an integration without the capability fails the file as notSupported", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "notSupported" }),
    )
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("any other error fails the file as failed, with the rows written so far", async () => {
    mocks.listComments
      .mockResolvedValueOnce(page(["1"], "c2"))
      .mockRejectedValueOnce(new Error("boom"))

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith({
      fileId: "file-1",
      reason: "failed",
      rowCount: 1,
      workspaceId: "ws-1",
    })
    expect(mocks.complete).not.toHaveBeenCalled()
    // Never the raw error text in the file's state.
    expect(JSON.stringify(mocks.fail.mock.calls)).not.toContain("boom")
  })

  test("a post of an unknown channel still ends the file as failed", async () => {
    mocks.resolveTargets.mockResolvedValue([
      { ...target("p1"), channel: "carrier-pigeon" },
    ])
    mocks.listComments.mockRejectedValue(new Error("boom"))

    await exportChannelPostComments(data())

    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1", reason: "failed" }),
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("a failure aborts the upload, so no partial object is left", async () => {
    mocks.listComments.mockRejectedValue(new Error("boom"))

    await exportChannelPostComments(data())

    const upload = mocks.createUpload.mock.results[0]?.value as {
      stream: PassThrough
    }
    expect(upload.stream.destroyed).toBe(true)
  })
})
