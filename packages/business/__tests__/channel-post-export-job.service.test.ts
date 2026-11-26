import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertRoom: vi.fn(),
  charge: vi.fn(),
  claimKey: vi.fn(),
  create: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findPosts: vi.fn(),
  getKeyOwner: vi.fn(),
  getPresignedDownload: vi.fn(),
  logError: vi.fn(),
  queueAdd: vi.fn(),
  releaseKeyIfOwner: vi.fn(),
  renewKeyIfOwner: vi.fn(),
  claimFirstRun: vi.fn(),
  listPendingExports: vi.fn(),
  updatePending: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: { findByIds: mocks.findPosts },
  fileRepository: {
    create: mocks.create,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    claimFirstRunForWorkspace: mocks.claimFirstRun,
    listPendingExportsForWorkspace: mocks.listPendingExports,
    updatePendingForWorkspace: mocks.updatePending,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedDownload: mocks.getPresignedDownload },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    claimKey: mocks.claimKey,
    getKeyOwner: mocks.getKeyOwner,
    releaseKeyIfOwner: mocks.releaseKeyIfOwner,
    renewKeyIfOwner: mocks.renewKeyIfOwner,
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "file-1",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChannelPostExportJobAction: {
    exportChannelPostComments: "exportChannelPostComments",
  },
  channelPostExportQueue: { add: mocks.queueAdd },
  exportChannelPostCommentsJobId: (fileId: string) => `export-cpc-${fileId}`,
}))

vi.mock("../src/message-usage/service", () => ({
  messageUsageService: { assertRoom: mocks.assertRoom, charge: mocks.charge },
}))

vi.mock("../src/channel-post/comments.service", () => ({
  MAX_MERGE_VIEW_POSTS: 20,
}))

vi.mock("../src/logger", () => ({
  logger: { error: mocks.logError, warn: mocks.warn },
}))

const { channelPostCommentExportService, channelPostExportLockKey } =
  await import("../src/channel-post/export-job.service")

const post = (id: string, channel = "messenger") => ({
  caption: `Caption ${id}`,
  channel,
  commentsCount: 10,
  externalPostId: `ext-${id}`,
  id,
  inboxId: "inbox-1",
  metricsKnownMask: 9,
})

const start = (overrides: Record<string, unknown> = {}) =>
  channelPostCommentExportService.start({
    canViewEmailAndPhone: true,
    kind: "comments",
    postIds: ["p2", "p1"],
    userId: "u1",
    workspaceId: "ws-1",
    ...overrides,
  })

const uploadedFile = (overrides: Record<string, unknown> = {}) => ({
  contextType: "export",
  // A file that is still running was created just now (an old pending one reads as dead).
  createdAt:
    overrides.status === "pending"
      ? new Date()
      : new Date("2026-11-20T00:00:00.000Z"),
  fileName: "post-comments-2026-11-20.csv",
  id: "file-1",
  meta: {
    containsContactData: true,
    kind: "comments",
    sourceIds: ["p1", "p2"],
    totalRecords: 7,
  },
  path: "workspaces/ws-1/exports/channel-posts/comments_file-1.csv",
  status: "uploaded",
  subType: "channelPostComments",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPosts.mockResolvedValue([post("p1"), post("p2")])
  mocks.assertRoom.mockResolvedValue(undefined)
  mocks.claimKey.mockResolvedValue(true)
  mocks.create.mockResolvedValue(undefined)
  mocks.queueAdd.mockResolvedValue(undefined)
  mocks.releaseKeyIfOwner.mockResolvedValue(true)
  mocks.charge.mockResolvedValue(undefined)
  mocks.updatePending.mockResolvedValue(true)
  mocks.listPendingExports.mockResolvedValue([])
  mocks.claimFirstRun.mockResolvedValue(true)
  mocks.renewKeyIfOwner.mockResolvedValue(true)
  mocks.findByIdForWorkspace.mockResolvedValue(null)
  mocks.getPresignedDownload.mockResolvedValue("https://signed.example/file")
})

describe("channelPostCommentExportService.start", () => {
  test("creates the file row and enqueues one job with a deterministic id and one attempt", async () => {
    await expect(start()).resolves.toEqual({
      fileId: "file-1",
      status: "pending",
    })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: "export",
        id: "file-1",
        meta: {
          containsContactData: true,
          expectedRecords: 20,
          kind: "comments",
          sourceIds: ["p2", "p1"],
          totalRecords: 0,
        },
        path: "workspaces/ws-1/exports/channel-posts/comments_file-1.csv",
        status: "pending",
        subType: "channelPostComments",
        userId: "u1",
        workspaceId: "ws-1",
      }),
    )
    const [name, payload, options] = mocks.queueAdd.mock.calls[0] ?? []
    expect(name).toBe("exportChannelPostComments")
    expect(payload.data).toMatchObject({
      canViewEmailAndPhone: true,
      fileId: "file-1",
      kind: "comments",
      postIds: ["p2", "p1"],
      requestedUserId: "u1",
      workspaceId: "ws-1",
    })
    expect(options).toMatchObject({ attempts: 1, jobId: "export-cpc-file-1" })
    expect(options.jobId).not.toContain(":")
  })

  test("the expected rows are unknown when a post never had its comment count reported", async () => {
    mocks.findPosts.mockResolvedValue([
      post("p1"),
      { ...post("p2"), commentsCount: 0, metricsKnownMask: 0 },
    ])

    await start()

    const [{ meta }] = mocks.create.mock.calls[0] ?? []
    expect(meta).not.toHaveProperty("expectedRecords")
  })

  test("a known zero comment count still counts as known", async () => {
    mocks.findPosts.mockResolvedValue([
      { ...post("p1"), commentsCount: 0, metricsKnownMask: 9 },
      post("p2"),
    ])

    await start()

    expect(mocks.create.mock.calls[0]?.[0].meta.expectedRecords).toBe(10)
  })

  test("looks the posts up in the caller's workspace and refuses one that is not there", async () => {
    mocks.findPosts.mockResolvedValue([post("p1")])

    await expect(start()).rejects.toMatchObject({ httpStatusCode: 404 })

    expect(mocks.findPosts).toHaveBeenCalledWith({
      ids: ["p2", "p1"],
      workspaceId: "ws-1",
    })
    expect(mocks.claimKey).not.toHaveBeenCalled()
  })

  test("refuses a post whose channel cannot be read for comments", async () => {
    mocks.findPosts.mockResolvedValue([post("p1"), post("p2", "whatsapp")])

    await expect(start()).rejects.toMatchObject({
      code: "commentExportUnsupported",
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test.each([
    "phones",
    "emails",
  ] as const)("refuses %s without the email-and-phone permission, before anything is read", async (kind) => {
    await expect(
      start({ canViewEmailAndPhone: false, kind }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", httpStatusCode: 403 })
    expect(mocks.findPosts).not.toHaveBeenCalled()
  })

  test("a comments export needs no contact-data permission", async () => {
    await expect(start({ canViewEmailAndPhone: false })).resolves.toMatchObject(
      { fileId: "file-1" },
    )
  })

  test("refuses none or too many posts", async () => {
    await expect(start({ postIds: [] })).rejects.toMatchObject({
      code: "validation",
    })
    await expect(
      start({ postIds: Array.from({ length: 21 }, (_, i) => `p${i}`) }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("refuses when the owner has no message left, before taking the lock", async () => {
    mocks.assertRoom.mockRejectedValue(new Error("quota"))

    await expect(start()).rejects.toThrow("quota")
    expect(mocks.claimKey).not.toHaveBeenCalled()
  })

  test("a start while one runs answers with the running file and creates nothing", async () => {
    mocks.claimKey.mockResolvedValue(false)
    mocks.getKeyOwner.mockResolvedValue("file-0")
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ id: "file-0", status: "pending" }),
    )

    await expect(start()).resolves.toEqual({
      fileId: "file-0",
      status: "pending",
    })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("the lock key is the same for the same posts in any order and differs by kind", () => {
    const key = (kind: "comments" | "phones", postIds: string[]) =>
      channelPostExportLockKey({
        containsContactData: true,
        kind,
        postIds,
        workspaceId: "ws-1",
      })

    expect(key("comments", ["p2", "p1"])).toBe(key("comments", ["p1", "p2"]))
    expect(key("comments", ["p1"])).not.toBe(key("phones", ["p1"]))
  })

  test("callers who may and may not see contact data never share a lock", () => {
    const key = (containsContactData: boolean) =>
      channelPostExportLockKey({
        containsContactData,
        kind: "comments",
        postIds: ["p1"],
        workspaceId: "ws-1",
      })

    expect(key(true)).not.toBe(key(false))
    expect(key(false)).toContain(":masked:")
  })

  test("a caller without the permission does not join a run started with it: own lock, own file", async () => {
    mocks.claimKey.mockResolvedValue(true)

    await start({ canViewEmailAndPhone: true })
    await start({ canViewEmailAndPhone: false })

    expect(mocks.claimKey.mock.calls.map(([key]) => key)).toEqual([
      "channel-post-export:ws-1:comments:full:p1,p2",
      "channel-post-export:ws-1:comments:masked:p1,p2",
    ])
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.create.mock.calls[0]?.[0].meta.containsContactData).toBe(true)
    expect(mocks.create.mock.calls[1]?.[0].meta.containsContactData).toBe(false)
  })

  test("takes the lock with the file id as value and a ceiling-long TTL", async () => {
    await start()

    const [key, owner, ttl] = mocks.claimKey.mock.calls[0] ?? []
    expect(key).toBe("channel-post-export:ws-1:comments:full:p1,p2")
    expect(owner).toBe("file-1")
    expect(ttl).toBe(31 * 60)
  })

  test("two starts racing: one wins the lock and the other gets its file", async () => {
    mocks.claimKey.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    mocks.getKeyOwner.mockResolvedValue("file-1")
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )

    const [first, second] = await Promise.all([start(), start()])

    expect(first.fileId).toBe("file-1")
    expect(second.fileId).toBe("file-1")
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("a holder that already settled frees the left-over lock and the start claims it again", async () => {
    mocks.claimKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    mocks.getKeyOwner.mockResolvedValue("file-0")
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ id: "file-0", status: "uploaded" }),
    )

    await expect(start()).resolves.toMatchObject({ fileId: "file-1" })

    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledWith(
      "channel-post-export:ws-1:comments:full:p1,p2",
      "file-0",
    )
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  test("a holder whose job died (stale pending) frees the lock and the start claims it again", async () => {
    mocks.claimKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    mocks.getKeyOwner.mockResolvedValue("file-0")
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        id: "file-0",
        status: "pending",
      }),
    )

    await expect(start()).resolves.toMatchObject({ fileId: "file-1" })

    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledWith(
      expect.any(String),
      "file-0",
    )
  })

  describe("the cap of running exports per workspace", () => {
    const running = (overrides: Record<string, unknown> = {}) => ({
      createdAt: new Date(),
      id: "file-0",
      meta: {
        containsContactData: true,
        kind: "comments",
        sourceIds: ["p9"],
      },
      status: "pending",
      ...overrides,
    })

    test("a start for another selection while one runs is refused, before any lock is taken", async () => {
      mocks.listPendingExports.mockResolvedValue([running()])

      await expect(start()).rejects.toMatchObject({
        code: "exportInProgress",
        httpStatusCode: 409,
      })

      expect(mocks.listPendingExports).toHaveBeenCalledWith(
        expect.objectContaining({
          subType: "channelPostComments",
          workspaceId: "ws-1",
        }),
      )
      expect(mocks.claimKey).not.toHaveBeenCalled()
      expect(mocks.create).not.toHaveBeenCalled()
    })

    test("a start for the selection that runs answers with its file", async () => {
      mocks.listPendingExports.mockResolvedValue([
        running({
          meta: {
            containsContactData: true,
            kind: "comments",
            sourceIds: ["p1", "p2"],
          },
        }),
      ])

      await expect(start()).resolves.toEqual({
        fileId: "file-0",
        status: "pending",
      })
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.queueAdd).not.toHaveBeenCalled()
    })

    test("a file queued 40 minutes with no heartbeat still counts: another selection is refused", async () => {
      mocks.listPendingExports.mockResolvedValue([
        running({ createdAt: new Date(Date.now() - 40 * 60 * 1000) }),
      ])

      await expect(start()).rejects.toMatchObject({ code: "exportInProgress" })
      expect(mocks.create).not.toHaveBeenCalled()
    })

    test("the same selection started again after its lock expired in the queue gets the queued file, not a second one", async () => {
      mocks.claimKey.mockResolvedValue(true)
      mocks.listPendingExports.mockResolvedValue([
        running({
          createdAt: new Date(Date.now() - 40 * 60 * 1000),
          meta: {
            containsContactData: true,
            kind: "comments",
            sourceIds: ["p1", "p2"],
          },
        }),
      ])

      await expect(start()).resolves.toEqual({
        fileId: "file-0",
        status: "pending",
      })
      expect(mocks.claimKey).not.toHaveBeenCalled()
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.queueAdd).not.toHaveBeenCalled()
    })

    test("a started export whose heartbeat is older than the lock's TTL does not count", async () => {
      mocks.listPendingExports.mockResolvedValue([
        running({
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
          meta: {
            ...running().meta,
            heartbeatAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
          },
        }),
      ])

      await expect(start()).resolves.toMatchObject({ fileId: "file-1" })
    })

    test("a pending file nobody picked up within the maximum queue wait does not count", async () => {
      mocks.listPendingExports.mockResolvedValue([
        running({ createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) }),
      ])

      await expect(start()).resolves.toMatchObject({ fileId: "file-1" })
      expect(mocks.create).toHaveBeenCalledTimes(1)
    })
  })

  test("a holder whose file row does not exist yet is a conflict, never an id that would 404, and its lock is left alone", async () => {
    mocks.claimKey.mockResolvedValue(false)
    mocks.getKeyOwner.mockResolvedValue("file-0")
    mocks.findByIdForWorkspace.mockResolvedValue(null)

    await expect(start()).rejects.toMatchObject({
      code: "exportInProgress",
      httpStatusCode: 409,
    })
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "file-0",
      workspaceId: "ws-1",
    })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.releaseKeyIfOwner).not.toHaveBeenCalled()
  })

  test("a lock freed between the two reads is claimed on the second try", async () => {
    mocks.claimKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    mocks.getKeyOwner.mockResolvedValue(null)

    await expect(start()).resolves.toMatchObject({ fileId: "file-1" })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  test("a lock that stays unreadable is a conflict, not a second export", async () => {
    mocks.claimKey.mockResolvedValue(false)
    mocks.getKeyOwner.mockResolvedValue(null)

    await expect(start()).rejects.toMatchObject({ httpStatusCode: 409 })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("a failed enqueue marks the file failed and frees the lock", async () => {
    mocks.queueAdd.mockRejectedValue(new Error("redis down"))
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )

    await expect(start()).rejects.toThrow("redis down")

    expect(mocks.updatePending).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "failed" }),
      }),
    )
    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledWith(
      "channel-post-export:ws-1:comments:full:p1,p2",
      "file-1",
    )
  })
})

describe("channelPostCommentExportService.getStatus", () => {
  const status = (overrides: Record<string, unknown> = {}) =>
    channelPostCommentExportService.getStatus({
      canViewEmailAndPhone: true,
      fileId: "file-1",
      workspaceId: "ws-1",
      ...overrides,
    })

  test("an uploaded file answers with a five-minute signed link and its counts", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: {
          expectedRecords: 9,
          kind: "comments",
          sourceIds: ["p1"],
          totalRecords: 7,
          truncated: true,
        },
      }),
    )

    await expect(status()).resolves.toEqual({
      downloadUrl: "https://signed.example/file",
      expectedRows: 9,
      expiresAt: new Date("2026-11-27T00:00:00.000Z"),
      failureReason: null,
      fileId: "file-1",
      fileName: "post-comments-2026-11-20.csv",
      kind: "comments",
      rowCount: 7,
      status: "uploaded",
      truncated: true,
    })
    expect(mocks.getPresignedDownload).toHaveBeenCalledWith(
      "workspaces/ws-1/exports/channel-posts/comments_file-1.csv",
      300,
    )
  })

  test("a file still running has no link", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )

    await expect(status()).resolves.toMatchObject({
      downloadUrl: null,
      status: "pending",
    })
    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("a failed file reports its reason code and no link", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: {
          failureReason: "rateLimited",
          kind: "comments",
          sourceIds: ["p1"],
        },
        status: "failed",
      }),
    )

    await expect(status()).resolves.toMatchObject({
      downloadUrl: null,
      failureReason: "rateLimited",
      status: "failed",
    })
  })

  test("a file of another workspace or an unknown id is not found", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(null)

    await expect(status()).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
    })
  })

  test("a file of another export kind is not found", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ subType: "contacts" }),
    )

    await expect(status()).rejects.toMatchObject({ httpStatusCode: 404 })
  })

  test("a phones file is not linked to a caller who lost the permission", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: { kind: "phones", sourceIds: ["p1"], totalRecords: 3 },
      }),
    )

    await expect(status({ canViewEmailAndPhone: false })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    )
    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("an unmasked comments file is not linked to a caller who lost the permission", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: {
          containsContactData: true,
          kind: "comments",
          sourceIds: ["p1"],
          totalRecords: 3,
        },
      }),
    )

    await expect(status({ canViewEmailAndPhone: false })).rejects.toMatchObject(
      { code: "FORBIDDEN", httpStatusCode: 403 },
    )
    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("a masked comments file is linked to a caller without the permission", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: {
          containsContactData: false,
          kind: "comments",
          sourceIds: ["p1"],
          totalRecords: 3,
        },
      }),
    )

    await expect(
      status({ canViewEmailAndPhone: false }),
    ).resolves.toMatchObject({ downloadUrl: "https://signed.example/file" })
  })

  test("a pending file whose heartbeat is recent reads as pending, however old the row", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        meta: {
          containsContactData: true,
          heartbeatAt: new Date(Date.now() - 60_000).toISOString(),
          kind: "comments",
          sourceIds: ["p1"],
        },
        status: "pending",
      }),
    )

    await expect(status()).resolves.toMatchObject({
      failureReason: null,
      status: "pending",
    })
  })

  test("a pending file whose heartbeat is older than the lock's TTL reads as failed", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        meta: {
          containsContactData: true,
          heartbeatAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
          kind: "comments",
          sourceIds: ["p1"],
        },
        status: "pending",
      }),
    )

    await expect(status()).resolves.toMatchObject({
      downloadUrl: null,
      failureReason: "failed",
      status: "failed",
    })
  })

  test("a pending file still queued after 40 minutes with no heartbeat reads as pending: it may wait behind running exports", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 40 * 60 * 1000),
        status: "pending",
      }),
    )

    await expect(status()).resolves.toMatchObject({ status: "pending" })
  })

  test("a pending file nobody picked up within the maximum queue wait reads as failed", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - (3 * 60 + 1) * 60 * 1000),
        status: "pending",
      }),
    )

    await expect(status()).resolves.toMatchObject({
      failureReason: "failed",
      status: "failed",
    })
  })

  test("a running phones file still reports its progress to a caller without the permission", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: { kind: "phones", sourceIds: ["p1"], totalRecords: 3 },
        status: "pending",
      }),
    )

    await expect(
      status({ canViewEmailAndPhone: false }),
    ).resolves.toMatchObject({ rowCount: 3, status: "pending" })
  })
})

describe("channelPostCommentExportService settling", () => {
  beforeEach(() => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )
  })

  test("complete marks the file uploaded, keeps its meta, charges one message and frees the lock", async () => {
    await channelPostCommentExportService.complete({
      bytes: 120,
      fileId: "file-1",
      rowCount: 5,
      truncated: true,
      workspaceId: "ws-1",
    })

    const [{ values }] = mocks.updatePending.mock.calls[0] ?? []
    expect(values).toMatchObject({
      fileSize: "120",
      meta: {
        kind: "comments",
        sourceIds: ["p1", "p2"],
        totalRecords: 5,
        truncated: true,
      },
      status: "uploaded",
    })
    expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: "ws-1" })
    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledWith(
      "channel-post-export:ws-1:comments:full:p1,p2",
      "file-1",
    )
  })

  test("a charge that fails leaves the file uploaded: logged, never turned into a failure", async () => {
    mocks.charge.mockRejectedValue(new Error("quota down"))

    await expect(
      channelPostCommentExportService.complete({
        bytes: 1,
        fileId: "file-1",
        rowCount: 1,
        truncated: false,
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.updatePending).toHaveBeenCalledTimes(1)
    expect(mocks.updatePending.mock.calls[0]?.[0].values.status).toBe(
      "uploaded",
    )
    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalledTimes(1)
  })

  test("a settle of a file that is no longer pending charges and releases nothing", async () => {
    mocks.updatePending.mockResolvedValue(false)

    await channelPostCommentExportService.complete({
      bytes: 1,
      fileId: "file-1",
      rowCount: 1,
      truncated: false,
      workspaceId: "ws-1",
    })
    await channelPostCommentExportService.fail({
      fileId: "file-1",
      reason: "failed",
      workspaceId: "ws-1",
    })

    expect(mocks.charge).not.toHaveBeenCalled()
    expect(mocks.releaseKeyIfOwner).not.toHaveBeenCalled()
  })

  test("fail records the reason, charges nothing and frees the lock", async () => {
    await channelPostCommentExportService.fail({
      fileId: "file-1",
      reason: "channelDisconnected",
      workspaceId: "ws-1",
    })

    const [{ values }] = mocks.updatePending.mock.calls[0] ?? []
    expect(values).toMatchObject({
      meta: { failureReason: "channelDisconnected", kind: "comments" },
      status: "failed",
    })
    expect(mocks.charge).not.toHaveBeenCalled()
    expect(mocks.releaseKeyIfOwner).toHaveBeenCalledTimes(1)
  })

  test("a lock that cannot be freed does not fail the settle: the TTL frees it", async () => {
    mocks.releaseKeyIfOwner.mockRejectedValue(new Error("redis down"))

    await expect(
      channelPostCommentExportService.fail({
        fileId: "file-1",
        reason: "failed",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  test("progress updates the rows read and renews the start lock", async () => {
    await channelPostCommentExportService.recordProgress({
      canViewEmailAndPhone: true,
      fileId: "file-1",
      kind: "comments",
      postIds: ["p2", "p1"],
      rowCount: 42,
      workspaceId: "ws-1",
    })

    const [{ values }] = mocks.updatePending.mock.calls[0] ?? []
    expect(values.meta.totalRecords).toBe(42)
    expect(values.status).toBeUndefined()
    expect(mocks.renewKeyIfOwner).toHaveBeenCalledWith(
      "channel-post-export:ws-1:comments:full:p1,p2",
      "file-1",
      31 * 60,
    )
  })

  test("isPending is the raw status: a late-picked-up job still owns its old pending file", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: "pending",
      }),
    )

    await expect(
      channelPostCommentExportService.isPending({
        fileId: "file-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(true)
  })

  const begin = () =>
    channelPostCommentExportService.beginRun({
      fileId: "file-1",
      workspaceId: "ws-1",
    })
  const lockKey = "channel-post-export:ws-1:comments:full:p1,p2"

  test("beginRun claims the first run with a heartbeat and lets the job read", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )

    await expect(begin()).resolves.toBe(true)

    const [{ values, id, workspaceId }] =
      mocks.claimFirstRun.mock.calls[0] ?? []
    expect({ id, workspaceId }).toEqual({ id: "file-1", workspaceId: "ws-1" })
    expect(typeof values.meta.heartbeatAt).toBe("string")
    expect(values.meta.kind).toBe("comments")
  })

  test("of two concurrent beginRun calls on one file exactly one reads", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )
    mocks.claimFirstRun.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const results = await Promise.all([begin(), begin()])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(mocks.renewKeyIfOwner).toHaveBeenCalledTimes(1)
  })

  test("beginRun does not read again a file that a first run already stamped", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        meta: {
          heartbeatAt: new Date().toISOString(),
          kind: "comments",
          sourceIds: ["p1", "p2"],
        },
        status: "pending",
      }),
    )

    await expect(begin()).resolves.toBe(false)
    expect(mocks.claimFirstRun).not.toHaveBeenCalled()
    expect(mocks.updatePending).not.toHaveBeenCalled()
  })

  test("beginRun leaves a file that is not pending alone", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(uploadedFile())

    await expect(begin()).resolves.toBe(false)
    expect(mocks.claimFirstRun).not.toHaveBeenCalled()
  })

  test("beginRun lets a job that waited 40 minutes in the queue run, taking the lapsed lock again", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 40 * 60 * 1000),
        status: "pending",
      }),
    )
    mocks.renewKeyIfOwner.mockResolvedValue(false)
    mocks.claimKey.mockResolvedValue(true)

    await expect(begin()).resolves.toBe(true)

    expect(mocks.claimKey).toHaveBeenCalledWith(lockKey, "file-1", 31 * 60)
  })

  test("beginRun fails a file that waited past the maximum queue wait without starting: nothing to read, nothing charged", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        status: "pending",
      }),
    )

    await expect(begin()).resolves.toBe(false)

    expect(mocks.claimFirstRun).not.toHaveBeenCalled()
    expect(mocks.updatePending.mock.calls[0]?.[0].values).toMatchObject({
      status: "failed",
    })
    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("beginRun renews the start lock at pickup, a job picked up just before the lock expired keeps it", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )

    await expect(begin()).resolves.toBe(true)

    expect(mocks.renewKeyIfOwner).toHaveBeenCalledWith(
      lockKey,
      "file-1",
      31 * 60,
    )
    expect(mocks.claimKey).not.toHaveBeenCalled()
  })

  test("beginRun takes a lapsed lock again when it is free and goes on", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )
    mocks.renewKeyIfOwner.mockResolvedValue(false)
    mocks.claimKey.mockResolvedValue(true)

    await expect(begin()).resolves.toBe(true)

    expect(mocks.claimKey).toHaveBeenCalledWith(lockKey, "file-1", 31 * 60)
    expect(mocks.updatePending).not.toHaveBeenCalled()
  })

  test("beginRun stops and fails the file when another export holds the lock: no read, no charge", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )
    mocks.renewKeyIfOwner.mockResolvedValue(false)
    mocks.claimKey.mockResolvedValue(false)

    await expect(begin()).resolves.toBe(false)

    expect(mocks.updatePending.mock.calls[0]?.[0].values).toMatchObject({
      meta: { failureReason: "failed" },
      status: "failed",
    })
    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("beginRun goes on when Redis fails: a blip is not lost ownership", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      uploadedFile({ status: "pending" }),
    )
    mocks.renewKeyIfOwner.mockRejectedValue(new Error("redis down"))

    await expect(begin()).resolves.toBe(true)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.updatePending).not.toHaveBeenCalled()
  })

  describe("recordProgress lock ownership", () => {
    const progress = () =>
      channelPostCommentExportService.recordProgress({
        canViewEmailAndPhone: true,
        fileId: "file-1",
        kind: "comments",
        postIds: ["p2", "p1"],
        rowCount: 1,
        workspaceId: "ws-1",
      })

    test("reports ownership while the renewal succeeds", async () => {
      await expect(progress()).resolves.toBe(true)
    })

    test("a lapsed lock that is free is taken again and the run goes on", async () => {
      mocks.renewKeyIfOwner.mockResolvedValue(false)
      mocks.claimKey.mockResolvedValue(true)

      await expect(progress()).resolves.toBe(true)
      expect(mocks.claimKey).toHaveBeenCalledWith(lockKey, "file-1", 31 * 60)
    })

    test("a lock another export holds is lost ownership", async () => {
      mocks.renewKeyIfOwner.mockResolvedValue(false)
      mocks.claimKey.mockResolvedValue(false)

      await expect(progress()).resolves.toBe(false)
    })

    test("a Redis error is logged and the run goes on", async () => {
      mocks.renewKeyIfOwner.mockRejectedValue(new Error("redis down"))

      await expect(progress()).resolves.toBe(true)
      expect(mocks.warn).toHaveBeenCalledTimes(1)
    })
  })

  test("isPending is true only while the file waits for its job", async () => {
    await expect(
      channelPostCommentExportService.isPending({
        fileId: "file-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(true)
    mocks.findByIdForWorkspace.mockResolvedValue(uploadedFile())
    await expect(
      channelPostCommentExportService.isPending({
        fileId: "file-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(false)
  })
})

describe("channelPostCommentExportService.resolveTargets", () => {
  test("returns the posts in the requested order and drops a removed one", async () => {
    mocks.findPosts.mockResolvedValue([
      post("p1"),
      { ...post("p2"), caption: null },
    ])

    const targets = await channelPostCommentExportService.resolveTargets({
      postIds: ["p2", "p3", "p1"],
      workspaceId: "ws-1",
    })

    expect(targets.map((target) => [target.id, target.label])).toEqual([
      ["p2", "ext-p2"],
      ["p1", "Caption p1"],
    ])
  })
})
