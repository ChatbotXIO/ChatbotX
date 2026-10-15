import { MessengerAPIException } from "@chatbotx.io/integration-messenger/exception"
import {
  ChannelError,
  ChannelErrorCategory,
  SdkException,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
  createId: vi.fn(),
  createMessageRepository: vi.fn(),
  findAttachmentById: vi.fn(),
  findById: vi.fn(),
  findContact: vi.fn(),
  findContactInbox: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  optimizationEnabled: vi.fn(() => true),
  optimizeImage: vi.fn(),
  putObject: vi.fn(),
  runExclusive: vi.fn(),
  retrieveMedia: vi.fn(),
  resolveIntegrationContext: vi.fn(),
  runChannelHandler: vi.fn(),
  setAvatarIfEmptyOrSentinel: vi.fn(),
  updateAttachment: vi.fn(),
}))

let lockTail = Promise.resolve()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  buildNoAvatarSentinel: (failedAtMs = Date.now()) =>
    `public/img/no_avatar.jpg?time=${failedAtMs}`,
  contactInboxService: { findByUncached: mocks.findContactInbox },
  contactService: {
    findById: mocks.findContact,
    setAvatarIfEmptyOrSentinel: mocks.setAvatarIfEmptyOrSentinel,
  },
  FAILED_PREFIX: "failed:",
  isFailedOriginPath: (originPath: string) => originPath.startsWith("failed:"),
  isNoAvatarSentinelFresh: (failedAtMs: number, now = Date.now()) =>
    now - failedAtMs < 10 * 60 * 1000,
  isPendingOriginPath: (originPath: string) =>
    originPath.startsWith("http://") ||
    originPath.startsWith("https://") ||
    originPath.startsWith("wa-media:"),
  parseNoAvatarSentinel: (avatar: string) => {
    const prefix = "public/img/no_avatar.jpg?time="
    if (!avatar.startsWith(prefix)) {
      return null
    }
    const failedAtMs = Number(avatar.slice(prefix.length))
    return { failedAtMs: Number.isFinite(failedAtMs) ? failedAtMs : 0 }
  },
  WA_MEDIA_PREFIX: "wa-media:",
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))

// Mirrored keys are channel-first: workspace/<channel>/<workspace>/<integration>/<date>/<id>.
vi.mock("@chatbotx.io/filesystem", () => ({
  getChannelMediaPrefix: (location: {
    channel: string
    workspaceId: string
    integrationId: string
  }) =>
    `public/${location.channel}/${location.workspaceId}/${location.integrationId}/2026/10/06`,
  getMirroredChannelMediaPrefix: (location: {
    channel: string
    workspaceId: string
    integrationId: string
  }) =>
    `workspace/${location.channel}/${location.workspaceId}/${location.integrationId}/2026/10/06`,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: mocks.runExclusive,
  },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn: mocks.loggerWarn, info: mocks.loggerInfo }),
  toLogSafeError: (err: unknown) =>
    err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: "NonError", message: String(err) },
}))

const runExclusive = <T>({ fn }: { fn: () => Promise<T> }): Promise<T> => {
  const result = lockTail.then(fn)
  lockTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  getWhatsappClient: vi.fn(() => ({ retrieveMedia: mocks.retrieveMedia })),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: mocks.createId,
}))

vi.mock("@chatbotx.io/utils/image-optimize", () => ({
  optimizeImageForStorage: mocks.optimizeImage,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  isStoredImageOptimizationEnabled: mocks.optimizationEnabled,
}))

vi.mock("image-size", () => ({
  default: vi.fn(() => ({ height: 20, width: 10 })),
}))

vi.mock("../src/registry", () => ({
  integrationService: { getIntegrationFromContactInbox: vi.fn() },
  resolveIntegrationContextFromContactInbox: mocks.resolveIntegrationContext,
}))

const {
  AttachmentTooLargeError,
  downloadBearerUrlMedia,
  downloadWhatsappMedia,
  ensureAttachmentMirrored,
  ensureAttachmentStored,
  ensureContactAvatarMirrored,
  MediaNotReadyError,
  markAttachmentUnresolvable,
  MAX_ATTACHMENT_BYTES,
  readBodyWithCap,
  resolveFreshContactAvatarUrl,
  resolveFreshMediaUrl,
  restoreMirroredAttachment,
  TerminalMediaError,
} = await import("../src/media-hydration")

const workspaceId = "workspace-1"
const messageCreatedAt = new Date("2026-09-20T01:00:00.000Z")
const attachmentCreatedAt = new Date("2026-09-20T01:00:01.000Z")
const NO_AVATAR_SENTINEL_PATTERN = /^public\/img\/no_avatar\.jpg\?time=\d+$/
const UNAVAILABLE_PATTERN = /unavailable/i

type TestAttachment = {
  id: string
  messageId: string
  messageCreatedAt: Date
  sourceId: string | null
  originPath: string
  fileType: "image" | "video" | "audio" | "file"
  mimeType: string
  size: number
  createdAt: Date
  keepOriginal: boolean | null
}

const attachment = (
  id: string,
  originPath = `https://cdn.example/${id}`,
  sourceId: string | null = `source-${id}`,
): TestAttachment => ({
  id,
  messageId: "message-1",
  messageCreatedAt,
  sourceId,
  originPath,
  fileType: "image",
  mimeType: "image/jpeg",
  size: 0,
  createdAt: attachmentCreatedAt,
  keepOriginal: null,
})

const messageWith = (attachments: TestAttachment[]) => ({
  id: "message-1",
  workspaceId,
  sourceId: "graph-message-1",
  contactInboxId: "contact-inbox-1",
  createdAt: messageCreatedAt,
  attachments,
})

const arrangeAttachmentGraph = (attachments: TestAttachment[]) => {
  mocks.findAttachmentById.mockImplementation(
    async ({ id }: { id: string }) =>
      attachments.find((item) => item.id === id) ?? null,
  )
  mocks.findById.mockResolvedValue(messageWith(attachments))
  mocks.findContactInbox.mockResolvedValue({
    id: "contact-inbox-1",
    contactId: "contact-1",
    channel: "messenger",
    inboxId: "inbox-1",
    sourceId: "psid-1",
  })
  mocks.resolveIntegrationContext.mockResolvedValue({
    ctx: {
      auth: { tokens: { accessToken: "access-token" } },
      storagePrefix: "workspace-1",
      uploader: { putObject: mocks.putObject },
    },
    integration: { runChannelHandler: mocks.runChannelHandler },
    integrationRow: {
      id: "integration-1",
      inboxId: "inbox-1",
      auth: { tokens: { accessToken: "access-token" } },
    },
  })
}

describe("media hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    lockTail = Promise.resolve()
    mocks.runExclusive.mockImplementation(runExclusive)
    let id = 0
    mocks.createId.mockImplementation(() => `storage-${++id}`)
    mocks.createMessageRepository.mockResolvedValue({
      findAttachmentById: mocks.findAttachmentById,
      findById: mocks.findById,
      updateAttachment: mocks.updateAttachment,
    })
    mocks.putObject.mockResolvedValue(undefined)
    // Pass-through by default: the source bytes are stored as-is.
    mocks.optimizeImage.mockImplementation(
      async ({ bytes, mimeType }: { bytes: Buffer; mimeType: string }) => ({
        bytes,
        mimeType,
        optimized: false,
      }),
    )
    mocks.retrieveMedia.mockResolvedValue({
      url: "https://fresh.example/whatsapp",
      mime_type: "image/jpeg",
    })
    mocks.updateAttachment.mockResolvedValue(undefined)
    mocks.setAvatarIfEmptyOrSentinel.mockResolvedValue(undefined)
  })

  test("returns an already mirrored attachment without resolving its integration", async () => {
    const mirrored = attachment("101", "workspace/workspace-1/media/image.jpg")
    arrangeAttachmentGraph([mirrored])

    await expect(
      ensureAttachmentMirrored({
        attachmentId: mirrored.id,
        workspaceId,
      }),
    ).resolves.toEqual({ originPath: mirrored.originPath })

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.runExclusive).not.toHaveBeenCalled()
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  describe("ensureAttachmentStored", () => {
    test("returns a stored key without any DB read when the caller already holds it", async () => {
      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: "workspace/workspace-1/media/image.jpg",
        }),
      ).resolves.toEqual({
        originPath: "workspace/workspace-1/media/image.jpg",
      })

      expect(mocks.findAttachmentById).not.toHaveBeenCalled()
      expect(mocks.runExclusive).not.toHaveBeenCalled()
    })

    test.each([
      "tiktok",
      "api",
    ])("returns a %s attachment's external URL as-is: it is the durable value, not a pending reference", async (channel) => {
      const external = attachment("101", "https://cdn.example/clip.jpg", null)
      arrangeAttachmentGraph([external])
      mocks.findContactInbox.mockResolvedValue({
        id: "contact-inbox-1",
        contactId: "contact-1",
        channel,
        inboxId: "inbox-1",
        sourceId: "src-1",
      })

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: external.originPath,
        }),
      ).resolves.toEqual({ originPath: external.originPath })

      expect(mocks.runExclusive).not.toHaveBeenCalled()
      expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    })

    test("reports a transient lookup failure as not-ready instead of leaking the raw error", async () => {
      mocks.findAttachmentById.mockRejectedValue(new Error("db down"))

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: "https://cdn.example/101",
        }),
      ).rejects.toBeInstanceOf(MediaNotReadyError)
    })

    test("a slow lookup that outlives the timeout ends in not-ready, never an unhandled rejection", async () => {
      const unhandled: unknown[] = []
      const record = (reason: unknown) => unhandled.push(reason)
      process.on("unhandledRejection", record)
      try {
        mocks.findAttachmentById.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(null), 60)),
        )

        await ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: "https://cdn.example/101",
          timeoutMs: 10,
        }).catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(unhandled).toEqual([])
      } finally {
        process.off("unhandledRejection", record)
      }
    })

    test("keeps the mirrored key when only the metadata re-read fails", async () => {
      const pending = attachment("101", "https://cdn.example/101", "src-1")
      arrangeAttachmentGraph([pending])
      mocks.runExclusive.mockImplementation(async () => ({
        originPath: "workspace/messenger/workspace-1/x/y.jpg",
      }))
      // Both pre-mirror reads succeed; the re-read after the mirror fails.
      mocks.findAttachmentById
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockRejectedValue(new Error("db blip"))

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: pending.originPath,
        }),
      ).resolves.toEqual({
        originPath: "workspace/messenger/workspace-1/x/y.jpg",
      })
    })

    test("clears its timeout timer once the mirror finishes", async () => {
      vi.useFakeTimers()
      try {
        const pending = attachment("101", "https://cdn.example/101", "src-1")
        arrangeAttachmentGraph([pending])
        mocks.runExclusive.mockImplementation(async () => ({
          originPath: "workspace/messenger/workspace-1/x/y.jpg",
        }))

        await ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: pending.originPath,
        })

        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })

    test("returns null for a permanently failed attachment without mirroring", async () => {
      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: "failed:unresolvable",
        }),
      ).resolves.toBeNull()

      expect(mocks.runExclusive).not.toHaveBeenCalled()
    })

    test("mirrors a pending attachment and returns the stored key with its final metadata", async () => {
      const pending = attachment("101", "https://cdn.example/101", null)
      const mirroredRow = {
        ...pending,
        originPath: "workspace/messenger/workspace-1/integration-1/x/y.jpg",
        mimeType: "image/jpeg",
        size: 321,
      }
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "g-1",
          url: "https://fresh.example/101",
          mimeType: "image/jpeg",
        },
      ])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Promise.resolve(
            new Response(new Uint8Array([1, 2, 3]), {
              headers: { "content-type": "image/jpeg" },
            }),
          ),
        ),
      )
      // After the mirror ran, the row re-read returns the stored values.
      mocks.findAttachmentById
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(pending)
        .mockResolvedValue(mirroredRow)

      const stored = await ensureAttachmentStored({
        attachmentId: "101",
        workspaceId,
        messageCreatedAt,
        originPath: pending.originPath,
      })

      expect(stored).toEqual({
        originPath: mirroredRow.originPath,
        mimeType: "image/jpeg",
        size: 321,
      })
      expect(mocks.findAttachmentById).toHaveBeenCalledWith(
        expect.objectContaining({ messageCreatedAt }),
      )
    })

    test("returns null when the mirror fails terminally", async () => {
      const pending = attachment("101", "https://cdn.example/101", "src-1")
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([])

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: pending.originPath,
        }),
      ).resolves.toBeNull()
    })

    test("throws MediaNotReadyError when the mirror outlives the wait", async () => {
      const pending = attachment("101", "https://cdn.example/101", "src-1")
      arrangeAttachmentGraph([pending])
      mocks.runExclusive.mockImplementation(
        () => new Promise<never>(() => undefined),
      )

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: pending.originPath,
          timeoutMs: 20,
        }),
      ).rejects.toBeInstanceOf(MediaNotReadyError)
    })

    test("bounds the lock wait to the caller's timeout instead of the 5 minute default", async () => {
      const pending = attachment("101", "https://cdn.example/101", "src-1")
      arrangeAttachmentGraph([pending])
      mocks.runExclusive.mockImplementation(
        () => new Promise<never>(() => undefined),
      )

      await expect(
        ensureAttachmentStored({
          attachmentId: "101",
          workspaceId,
          originPath: pending.originPath,
          timeoutMs: 20,
        }),
      ).rejects.toBeInstanceOf(MediaNotReadyError)

      expect(mocks.runExclusive).toHaveBeenCalledWith(
        expect.objectContaining({ retryTimeoutInSeconds: 1 }),
      )
    })
  })

  test("returns null for mirrored media without loading the attachment graph", async () => {
    const mirrored = attachment("101", "workspace/workspace-1/media/image.jpg")
    arrangeAttachmentGraph([mirrored])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: mirrored.id,
        workspaceId,
      }),
    ).resolves.toBeNull()

    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })

  test("resolves fresh media for a mirrored attachment when allowMirrored is set", async () => {
    const mirrored = attachment("101", "workspace/workspace-1/media/image.jpg")
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: mirrored.id,
        workspaceId,
        allowMirrored: true,
        messageCreatedAt,
      }),
    ).resolves.toEqual({
      channel: "messenger",
      integrationId: "integration-1",
      sourceId: "source-101",
      url: "https://fresh.example/101",
      mimeType: "image/jpeg",
    })

    expect(mocks.findAttachmentById).toHaveBeenCalledWith({
      id: mirrored.id,
      workspaceId,
      messageCreatedAt,
    })
    expect(mocks.updateAttachment).not.toHaveBeenCalled()
  })

  test("pairs a mirrored attachment with an internal sourceId by position when counts match", async () => {
    // Realtime-received Messenger attachments carry a generated id, not the
    // Graph attachment id, so identity matching can never succeed for them.
    const mirrored = attachment(
      "101",
      "public/ws/workspace-1/2026/10/05/image",
      "11724778331053711",
    )
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-attachment-1",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: mirrored.id,
        workspaceId,
        allowMirrored: true,
      }),
    ).resolves.toMatchObject({ url: "https://fresh.example/101" })
  })

  test("does not hand the browser a different kind of file for a row without a provider id", async () => {
    // First view of a live webhook row: the redirect must follow the same safe
    // pairing as the mirror, or a photo could be shown as the sibling video.
    const pending = attachment("101", "https://cdn.example/p.jpg", null)
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-1",
        url: "https://fresh.example/clip.mp4",
        mimeType: "video/mp4",
      },
    ])

    await expect(
      resolveFreshMediaUrl({ attachmentId: "101", workspaceId }),
    ).resolves.toBeNull()
  })

  test("serves a live webhook row from its own CDN URL without asking the provider", async () => {
    // First view of a fresh photo: the webhook URL still works, so the browser
    // gets it right away; Graph is only the recovery path for an expired URL.
    const pending = attachment(
      "101",
      "https://scontent.xx.fbcdn.net/p.jpg",
      null,
    )
    arrangeAttachmentGraph([pending])

    await expect(
      resolveFreshMediaUrl({ attachmentId: "101", workspaceId }),
    ).resolves.toMatchObject({
      url: "https://scontent.xx.fbcdn.net/p.jpg",
      channel: "messenger",
    })
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("does not pair a row without a provider id when the provider lists a different number of attachments", async () => {
    const attachments = [
      attachment("101", "https://cdn.example/a.jpg", null),
      attachment("102", "https://cdn.example/b.jpg", null),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-1",
        url: "https://fresh.example/only.jpg",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({ attachmentId: "102", workspaceId }),
    ).resolves.toBeNull()
  })

  test("does not pair a multi-attachment mirrored message by position", async () => {
    // Equal counts do not prove equal order: Graph may list the photos of a
    // two-photo message the other way round, and a positional restore would
    // then write the sibling's bytes under this row's key.
    const attachments = [
      attachment("101", "public/ws/workspace-1/a", "internal-1"),
      attachment("102", "public/ws/workspace-1/b", "internal-2"),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-attachment-1",
        url: "https://fresh.example/a",
        mimeType: "image/jpeg",
      },
      {
        sourceId: "graph-attachment-2",
        url: "https://fresh.example/b",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: "102",
        workspaceId,
        allowMirrored: true,
      }),
    ).resolves.toBeNull()
  })

  test("does not pair a mirrored attachment by position when the counts differ", async () => {
    const attachments = [
      attachment("101", "public/ws/workspace-1/a", "internal-1"),
      attachment("102", "public/ws/workspace-1/b", "internal-2"),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-attachment-1",
        url: "https://fresh.example/only-one",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: "102",
        workspaceId,
        allowMirrored: true,
      }),
    ).resolves.toBeNull()
  })

  test("keeps identity-only matching for a pending attachment", async () => {
    const pending = attachment("101", "https://cdn.example/101", "internal-1")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-attachment-1",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({ attachmentId: pending.id, workspaceId }),
    ).resolves.toBeNull()
  })

  test("restores an evicted photo through the encoder and refreshes the row", async () => {
    const mirrored = attachment(
      "101",
      "public/messenger/workspace-1/integration-1/2026/10/06/storage-9",
    )
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )
    const encoded = Buffer.from([7, 7])
    mocks.optimizeImage.mockResolvedValue({
      bytes: encoded,
      mimeType: "image/jpeg",
      optimized: true,
      width: 1600,
      height: 900,
    })

    await expect(
      restoreMirroredAttachment({
        attachmentId: mirrored.id,
        workspaceId,
        messageCreatedAt,
      }),
    ).resolves.toEqual({ restored: true })

    expect(mocks.findAttachmentById).toHaveBeenCalledWith({
      id: mirrored.id,
      workspaceId,
      messageCreatedAt,
    })
    // Same key: no new object name is minted.
    expect(mocks.createId).not.toHaveBeenCalled()
    expect(mocks.putObject).toHaveBeenCalledTimes(1)
    expect(mocks.putObject).toHaveBeenCalledWith(
      "public/messenger/workspace-1/integration-1/2026/10/06/storage-9",
      encoded,
      expect.objectContaining({
        ACL: "public-read",
        ContentType: "image/jpeg",
        ContentLength: 2,
      }),
    )
    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "101",
        fields: expect.objectContaining({
          originPath:
            "public/messenger/workspace-1/integration-1/2026/10/06/storage-9",
          mimeType: "image/jpeg",
          size: 2,
          width: 1600,
          height: 900,
        }),
      }),
    )
  })

  test("restore keeps the source bytes when the key's extension would not match the encoded format", async () => {
    const mirrored = attachment(
      "101",
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-9.png",
    )
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101.png",
        mimeType: "image/png",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          }),
        ),
      ),
    )
    mocks.optimizeImage.mockResolvedValue({
      bytes: Buffer.from([9]),
      mimeType: "image/jpeg",
      optimized: true,
      width: 10,
      height: 20,
    })

    await restoreMirroredAttachment({ attachmentId: "101", workspaceId })

    expect(mocks.putObject).toHaveBeenCalledWith(
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-9.png",
      expect.any(Buffer),
      expect.objectContaining({ ContentType: "image/png", ContentLength: 3 }),
    )
    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ mimeType: "image/png", size: 3 }),
      }),
    )
  })

  test("restores a publicly uploaded attachment with its public-read ACL", async () => {
    const realtime = attachment(
      "101",
      "public/ws/workspace-1/2026/10/05/image",
      "11724778331053711",
    )
    arrangeAttachmentGraph([realtime])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-attachment-1",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await expect(
      restoreMirroredAttachment({ attachmentId: realtime.id, workspaceId }),
    ).resolves.toEqual({ restored: true })

    expect(mocks.putObject).toHaveBeenCalledWith(
      "public/ws/workspace-1/2026/10/05/image",
      expect.any(Buffer),
      { ACL: "public-read", ContentLength: 3, ContentType: "image/jpeg" },
    )
  })

  test.each([
    ["pending", "https://cdn.example/101"],
    ["permanently failed", "failed:unresolvable"],
  ])("does not restore a %s attachment", async (_label, originPath) => {
    const row = attachment("101", originPath)
    arrangeAttachmentGraph([row])

    await expect(
      restoreMirroredAttachment({ attachmentId: row.id, workspaceId }),
    ).resolves.toEqual({ restored: false })

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("does not restore a channel that cannot re-derive its media", async () => {
    const mirrored = attachment("101", "workspace/workspace-1/media/image.jpg")
    arrangeAttachmentGraph([mirrored])
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      sourceId: "phone-1",
    })

    await expect(
      restoreMirroredAttachment({ attachmentId: mirrored.id, workspaceId }),
    ).resolves.toEqual({ restored: false })

    expect(mocks.retrieveMedia).not.toHaveBeenCalled()
    expect(mocks.putObject).not.toHaveBeenCalled()
    expect(mocks.updateAttachment).not.toHaveBeenCalled()
  })

  test("throws terminally for an oversized restore without marking the row failed", async () => {
    const mirrored = attachment("101", "workspace/workspace-1/media/video.mp4")
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/huge",
        mimeType: "video/mp4",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1]), {
            headers: {
              "content-length": String(MAX_ATTACHMENT_BYTES + 1),
              "content-type": "video/mp4",
            },
          }),
        ),
      ),
    )

    await expect(
      restoreMirroredAttachment({ attachmentId: mirrored.id, workspaceId }),
    ).rejects.toBeInstanceOf(TerminalMediaError)

    expect(mocks.putObject).not.toHaveBeenCalled()
    expect(mocks.updateAttachment).not.toHaveBeenCalled()
  })

  test("throws for failed media without resolving it again", async () => {
    const failed = attachment("101", "failed:too-large")
    arrangeAttachmentGraph([failed])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: failed.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({ reason: "already-failed" })

    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })

  test("throws for failed media in the mirror path without resolving it again", async () => {
    const failed = attachment("101", "failed:unresolvable")
    arrangeAttachmentGraph([failed])

    await expect(
      ensureAttachmentMirrored({
        attachmentId: failed.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({ reason: "already-failed" })

    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })

  test("resolves pending media by attachment identity without taking the mirror lock", async () => {
    const attachments = [
      attachment("103"),
      attachment("101"),
      attachment("102"),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
      {
        sourceId: "source-102",
        url: "https://fresh.example/102",
        mimeType: "image/png",
      },
      {
        sourceId: "source-103",
        url: "https://fresh.example/103",
        mimeType: "image/webp",
      },
    ])

    await expect(
      resolveFreshMediaUrl({
        attachmentId: "102",
        workspaceId,
      }),
    ).resolves.toEqual({
      channel: "messenger",
      integrationId: "integration-1",
      sourceId: "source-102",
      url: "https://fresh.example/102",
      mimeType: "image/png",
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.runExclusive).not.toHaveBeenCalled()
  })

  test("resolves the requested attachment even when a sibling has no fresh media", async () => {
    const attachments = [attachment("101"), attachment("102")]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({ attachmentId: "101", workspaceId }),
    ).resolves.toEqual({
      channel: "messenger",
      integrationId: "integration-1",
      sourceId: "source-101",
      url: "https://fresh.example/101",
      mimeType: "image/jpeg",
    })
  })

  test("returns null when the requested attachment has no matching fresh media", async () => {
    const attachments = [attachment("101"), attachment("102")]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])

    await expect(
      resolveFreshMediaUrl({ attachmentId: "102", workspaceId }),
    ).resolves.toBeNull()
  })

  test("re-derives once and mirrors all message attachments by identity", async () => {
    const attachments = [
      attachment("103"),
      attachment("101"),
      attachment("102"),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
      {
        sourceId: "source-102",
        url: "https://fresh.example/102",
        mimeType: "image/png",
      },
      {
        sourceId: "source-103",
        url: "https://fresh.example/103",
        mimeType: "image/webp",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: {
              "content-type": url.endsWith("102") ? "image/png" : "image/jpeg",
            },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({
        attachmentId: "102",
        workspaceId,
      }),
    ).resolves.toEqual({
      originPath:
        "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-2.png",
    })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "message",
      "getMessageMediaUrls",
      expect.objectContaining({ data: { graphMessageId: "graph-message-1" } }),
    )
    expect(mocks.putObject).toHaveBeenCalledTimes(3)
    expect(mocks.updateAttachment.mock.calls).toEqual([
      [
        expect.objectContaining({
          id: "101",
          fields: expect.objectContaining({
            originPath:
              "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "102",
          fields: expect.objectContaining({
            originPath:
              "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-2.png",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "103",
          fields: expect.objectContaining({
            originPath:
              "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-3.jpg",
          }),
        }),
      ],
    ])
  })

  test("re-encodes a mirrored photo before storing it and records the encoded bytes", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101.png",
        mimeType: "image/png",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": "image/png" },
          }),
        ),
      ),
    )
    const encoded = Buffer.from([9, 9])
    mocks.optimizeImage.mockResolvedValue({
      bytes: encoded,
      mimeType: "image/jpeg",
      optimized: true,
      width: 1600,
      height: 800,
    })

    await expect(
      ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
    ).resolves.toEqual({
      // The extension follows the stored bytes, not the source format.
      originPath:
        "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
    })

    expect(mocks.optimizeImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", profile: "media" }),
    )
    expect(mocks.putObject).toHaveBeenCalledTimes(1)
    expect(mocks.putObject).toHaveBeenCalledWith(
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      encoded,
      expect.objectContaining({ ContentType: "image/jpeg", ContentLength: 2 }),
    )
    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "101",
        fields: expect.objectContaining({
          mimeType: "image/jpeg",
          size: 2,
          width: 1600,
          height: 800,
        }),
      }),
    )
  })

  test("mirrors an image sent as a file without re-encoding it", async () => {
    const pending = { ...attachment("101"), keepOriginal: true }
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101.png",
        mimeType: "image/png",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          }),
        ),
      ),
    )

    await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

    expect(mocks.optimizeImage).not.toHaveBeenCalled()
    expect(mocks.putObject).toHaveBeenCalledWith(
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.png",
      expect.any(Buffer),
      expect.objectContaining({ ContentType: "image/png", ContentLength: 3 }),
    )
  })

  test("restores an image sent as a file with its original bytes", async () => {
    const mirrored = {
      ...attachment(
        "101",
        "public/messenger/workspace-1/integration-1/2026/10/06/storage-9",
      ),
      keepOriginal: true,
    }
    arrangeAttachmentGraph([mirrored])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await restoreMirroredAttachment({ attachmentId: "101", workspaceId })

    expect(mocks.optimizeImage).not.toHaveBeenCalled()
    expect(mocks.putObject).toHaveBeenCalledWith(
      "public/messenger/workspace-1/integration-1/2026/10/06/storage-9",
      expect.any(Buffer),
      expect.objectContaining({ ContentLength: 4 }),
    )
  })

  test("mirrors without re-encoding when the switch is off", async () => {
    mocks.optimizationEnabled.mockReturnValue(false)
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

    expect(mocks.optimizeImage).not.toHaveBeenCalled()
    expect(mocks.putObject).toHaveBeenCalledWith(
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      expect.any(Buffer),
      expect.objectContaining({ ContentType: "image/jpeg", ContentLength: 3 }),
    )
  })

  test("stores a mirrored video without running the image optimizer", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101.mp4",
        mimeType: "video/mp4",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "video/mp4" },
          }),
        ),
      ),
    )

    await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

    expect(mocks.optimizeImage).not.toHaveBeenCalled()
    expect(mocks.putObject).toHaveBeenCalledWith(
      "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.mp4",
      expect.any(Buffer),
      expect.objectContaining({ ContentType: "video/mp4", ContentLength: 3 }),
    )
  })

  test("marks an oversized attachment failed and throws a terminal error", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/huge",
        mimeType: "video/mp4",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1]), {
            headers: {
              "content-length": String(MAX_ATTACHMENT_BYTES + 1),
              "content-type": "video/mp4",
            },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({
        attachmentId: pending.id,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(TerminalMediaError)

    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pending.id,
        fields: expect.objectContaining({ originPath: "failed:too-large" }),
      }),
    )
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("keeps WhatsApp retrieveMedia hydration unchanged", async () => {
    const pending = attachment("101", "wa-media:media-101")
    arrangeAttachmentGraph([pending])
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      sourceId: "phone-1",
    })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {
        auth: { tokens: { accessToken: "whatsapp-token" } },
        storagePrefix: "workspace-1",
        uploader: { putObject: mocks.putObject },
      },
      integration: { runChannelHandler: mocks.runChannelHandler },
      integrationRow: {
        id: "integration-1",
        inboxId: "inbox-1",
        auth: { tokens: { accessToken: "whatsapp-token" } },
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({
        attachmentId: pending.id,
        workspaceId,
      }),
    ).resolves.toEqual({
      originPath:
        "workspace/whatsapp/workspace-1/integration-1/2026/10/06/storage-1.jpg",
    })

    expect(mocks.retrieveMedia).toHaveBeenCalledWith("media-101")
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("hydrates multiple WhatsApp attachments from each row's own media id", async () => {
    const attachments = [
      attachment("102", "wa-media:media-102"),
      attachment("101", "wa-media:media-101"),
    ]
    arrangeAttachmentGraph(attachments)
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      sourceId: "phone-1",
    })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {
        auth: { tokens: { accessToken: "whatsapp-token" } },
        storagePrefix: "workspace-1",
        uploader: { putObject: mocks.putObject },
      },
      integration: { runChannelHandler: mocks.runChannelHandler },
      integrationRow: {
        id: "integration-1",
        inboxId: "inbox-1",
        auth: { tokens: { accessToken: "whatsapp-token" } },
      },
    })
    mocks.retrieveMedia.mockImplementation(async (mediaId: string) => ({
      url: `https://fresh.example/${mediaId}`,
      mime_type: mediaId.endsWith("101") ? "image/jpeg" : "image/png",
    }))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: {
              "content-type": url.endsWith("101") ? "image/jpeg" : "image/png",
            },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({
        attachmentId: "102",
        workspaceId,
      }),
    ).resolves.toEqual({
      originPath:
        "workspace/whatsapp/workspace-1/integration-1/2026/10/06/storage-2.png",
    })

    expect(mocks.retrieveMedia.mock.calls).toEqual([
      ["media-101"],
      ["media-102"],
    ])
    expect(mocks.updateAttachment.mock.calls).toEqual([
      [
        expect.objectContaining({
          id: "101",
          fields: expect.objectContaining({
            originPath:
              "workspace/whatsapp/workspace-1/integration-1/2026/10/06/storage-1.jpg",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "102",
          fields: expect.objectContaining({
            originPath:
              "workspace/whatsapp/workspace-1/integration-1/2026/10/06/storage-2.png",
          }),
        }),
      ],
    ])
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("mirrors the requested attachment and leaves an unmatched sibling pending", async () => {
    const attachments = [attachment("101"), attachment("102")]
    arrangeAttachmentGraph(attachments)
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
    ).resolves.toEqual({
      originPath:
        "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
    })

    // Identity matching mirrors only the requested/matched attachment; the
    // sibling with no fresh media stays pending instead of failing the request.
    expect(mocks.putObject).toHaveBeenCalledTimes(1)
    expect(mocks.updateAttachment).toHaveBeenCalledTimes(1)
    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "101" }),
    )
  })

  test("falls back to positional matching for legacy rows without a sourceId", async () => {
    const attachments = [
      attachment("101", "https://cdn.example/101", null),
      attachment("102", "https://cdn.example/102", null),
    ]
    arrangeAttachmentGraph(attachments)
    // Media in the same (sorted) order as the attachments; their sourceIds do
    // not match, so the loop uses the positional index for these legacy rows.
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-a",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
      {
        sourceId: "graph-b",
        url: "https://fresh.example/102",
        mimeType: "image/png",
      },
    ])
    // The stored provider URLs have expired (403): only Graph's fresh URLs work.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://cdn.example")
          ? Promise.resolve(new Response(null, { status: 403 }))
          : Promise.resolve(
              new Response(new Uint8Array([1, 2, 3]), {
                headers: {
                  "content-type": url.endsWith("102")
                    ? "image/png"
                    : "image/jpeg",
                },
              }),
            ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({ attachmentId: "102", workspaceId }),
    ).resolves.toEqual({
      originPath:
        "workspace/messenger/workspace-1/integration-1/2026/10/06/storage-2.png",
    })
  })

  describe("webhook rows without a provider attachment id", () => {
    const expiredStoredUrlFetch = () =>
      vi.fn(async (url: string) =>
        url.startsWith("https://scontent.xx.fbcdn.net")
          ? Promise.resolve(new Response(null, { status: 403 }))
          : Promise.resolve(
              new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/jpeg" },
              }),
            ),
      )

    test("mirrors the stored webhook URL directly without calling Graph", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      const fetchMock = vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
      ).resolves.toEqual({
        originPath:
          "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      })

      expect(mocks.runChannelHandler).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledWith(
        "https://scontent.xx.fbcdn.net/p.jpg",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer access-token",
          }),
        }),
      )
    })

    test("stores a live webhook row's copy publicly, like an eagerly downloaded one", async () => {
      // Flows hand this URL to other systems ({{last_input}}, custom fields),
      // so it must stay reachable without signing, as eager media always was.
      arrangeAttachmentGraph([
        attachment("101", "https://scontent.xx.fbcdn.net/p.jpg", null),
      ])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Promise.resolve(
            new Response(new Uint8Array([1, 2, 3]), {
              headers: { "content-type": "image/jpeg" },
            }),
          ),
        ),
      )

      await expect(
        ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
      ).resolves.toEqual({
        originPath:
          "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      })
      expect(mocks.putObject).toHaveBeenCalledWith(
        "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
        expect.anything(),
        expect.objectContaining({ ACL: "public-read" }),
      )
    })

    test("falls back to Graph when the stored URL has expired and the message has one matching attachment", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://fresh.example/101",
          mimeType: "image/jpeg",
        },
      ])
      vi.stubGlobal("fetch", expiredStoredUrlFetch())

      await expect(
        ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
      ).resolves.toEqual({
        originPath:
          "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      })
      expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    })

    test("marks the row unresolvable when the stored URL expired and Graph returns a different number of attachments", async () => {
      const attachments = [
        attachment("101", "https://scontent.xx.fbcdn.net/a.jpg", null),
        attachment("102", "https://scontent.xx.fbcdn.net/b.jpg", null),
      ]
      arrangeAttachmentGraph(attachments)
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-b",
          url: "https://fresh.example/b",
          mimeType: "image/jpeg",
        },
      ])
      vi.stubGlobal("fetch", expiredStoredUrlFetch())

      const result = ensureAttachmentMirrored({
        attachmentId: "102",
        workspaceId,
      })

      await expect(result).rejects.toMatchObject({ reason: "unresolvable" })
      expect(mocks.updateAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "102",
          fields: expect.objectContaining({
            originPath: "failed:unresolvable",
          }),
        }),
      )
    })

    test("marks the row unresolvable when the Graph attachment at its position is a different kind of file", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://fresh.example/clip.mp4",
          mimeType: "video/mp4",
        },
      ])
      vi.stubGlobal("fetch", expiredStoredUrlFetch())

      await expect(
        ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
      ).rejects.toMatchObject({ reason: "unresolvable" })
      expect(mocks.putObject).not.toHaveBeenCalled()
    })

    test("keeps the row retryable when the stored URL fails with a server error", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Promise.resolve(new Response(null, { status: 503 }))),
      )

      const result = ensureAttachmentMirrored({
        attachmentId: "101",
        workspaceId,
      })

      await expect(result).rejects.toThrow("503")
      await expect(result).rejects.not.toBeInstanceOf(TerminalMediaError)
      expect(mocks.runChannelHandler).not.toHaveBeenCalled()
      expect(mocks.updateAttachment).not.toHaveBeenCalled()
    })

    test("never sends the page token to a host outside the provider's CDN", async () => {
      // A third-party URL (a shared link, a GIF host) must not receive the page
      // token: such a row goes straight to Graph.
      const pending = attachment("101", "https://tracker.example/p.jpg", null)
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://scontent.xx.fbcdn.net/fresh.jpg",
          mimeType: "image/jpeg",
        },
      ])
      const fetchMock = vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://scontent.xx.fbcdn.net/fresh.jpg",
        expect.anything(),
      )
    })

    test.each([
      "http://scontent.xx.fbcdn.net/p.jpg",
      "https://fbcdn.net.evil.example/p.jpg",
      "https://evilfbcdn.net/p.jpg",
    ])("does not treat %s as the provider's CDN", async (url) => {
      const pending = attachment("101", url, null)
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://scontent.xx.fbcdn.net/fresh.jpg",
          mimeType: "image/jpeg",
        },
      ])
      const fetchMock = vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

      expect(fetchMock).not.toHaveBeenCalledWith(url, expect.anything())
    })

    test.each([
      408, 429,
    ])("keeps the row retryable when the stored URL answers %s", async (status) => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Promise.resolve(new Response(null, { status }))),
      )

      const result = ensureAttachmentMirrored({
        attachmentId: "101",
        workspaceId,
      })

      await expect(result).rejects.not.toBeInstanceOf(TerminalMediaError)
      expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    })

    test("treats an empty body from the stored URL as gone and asks Graph", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://fresh.example/101",
          mimeType: "image/jpeg",
        },
      ])
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.startsWith("https://scontent.xx.fbcdn.net")
            ? Promise.resolve(new Response(new Uint8Array(0), { status: 200 }))
            : Promise.resolve(
                new Response(new Uint8Array([1, 2, 3]), {
                  headers: { "content-type": "image/jpeg" },
                }),
              ),
        ),
      )

      await expect(
        ensureAttachmentMirrored({ attachmentId: "101", workspaceId }),
      ).resolves.toEqual({
        originPath:
          "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      })
      expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    })

    test("skips a sibling whose URL is gone and cannot be paired, and still mirrors the requested row", async () => {
      const attachments = [
        attachment("101", "https://scontent.xx.fbcdn.net/a.jpg", null),
        attachment("102", "https://scontent.xx.fbcdn.net/b.jpg", null),
      ]
      arrangeAttachmentGraph(attachments)
      // Graph lists a different number of attachments: no pairing is possible.
      mocks.runChannelHandler.mockResolvedValue([])
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.endsWith("/a.jpg")
            ? Promise.resolve(new Response(null, { status: 403 }))
            : Promise.resolve(
                new Response(new Uint8Array([1, 2, 3]), {
                  headers: { "content-type": "image/jpeg" },
                }),
              ),
        ),
      )

      await expect(
        ensureAttachmentMirrored({ attachmentId: "102", workspaceId }),
      ).resolves.toEqual({
        originPath:
          "public/messenger/workspace-1/integration-1/2026/10/06/storage-1.jpg",
      })
      // The sibling is left pending, not marked failed.
      expect(mocks.updateAttachment).not.toHaveBeenCalledWith(
        expect.objectContaining({
          id: "101",
          fields: expect.objectContaining({
            originPath: "failed:unresolvable",
          }),
        }),
      )
    })

    test("logs where the bytes came from and what compression saved", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        null,
      )
      arrangeAttachmentGraph([pending])
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Promise.resolve(
            new Response(new Uint8Array([1, 2, 3]), {
              headers: { "content-type": "image/jpeg" },
            }),
          ),
        ),
      )

      await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentId: "101",
          source: "stored-url",
          optimized: false,
          bytesBefore: 3,
          bytesAfter: 3,
        }),
        expect.stringContaining("mirrored"),
      )
    })

    test("still resolves a row that carries a provider id by identity, without trying its stored URL", async () => {
      const pending = attachment(
        "101",
        "https://scontent.xx.fbcdn.net/p.jpg",
        "graph-1",
      )
      arrangeAttachmentGraph([pending])
      mocks.runChannelHandler.mockResolvedValue([
        {
          sourceId: "graph-1",
          url: "https://fresh.example/101",
          mimeType: "image/jpeg",
        },
      ])
      const fetchMock = vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      await ensureAttachmentMirrored({ attachmentId: "101", workspaceId })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://fresh.example/101",
        expect.anything(),
      )
    })
  })

  test("marks a row unresolvable when Graph resolves no media for it", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([])

    const result = ensureAttachmentMirrored({
      attachmentId: pending.id,
      workspaceId,
    })

    await expect(result).rejects.toThrow(UNAVAILABLE_PATTERN)
    await expect(result).rejects.toMatchObject({ reason: "unresolvable" })
    expect(mocks.putObject).not.toHaveBeenCalled()
    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pending.id,
        fields: expect.objectContaining({ originPath: "failed:unresolvable" }),
      }),
    )
  })

  test("marks a legacy row unresolvable when its stored URL expired and Graph cannot be paired", async () => {
    const attachments = [
      attachment("101", "https://cdn.example/101", null),
      attachment("102", "https://cdn.example/102", null),
    ]
    arrangeAttachmentGraph(attachments)
    // Graph dropped one url-less entry, so the counts differ: no attachment can
    // be paired safely, and retrying gets the same answer.
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "graph-b",
        url: "https://fresh.example/102",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("https://cdn.example")
          ? Promise.resolve(new Response(null, { status: 403 }))
          : Promise.resolve(
              new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/jpeg" },
              }),
            ),
      ),
    )

    const result = ensureAttachmentMirrored({
      attachmentId: "102",
      workspaceId,
    })

    await expect(result).rejects.toThrow(UNAVAILABLE_PATTERN)
    await expect(result).rejects.toBeInstanceOf(TerminalMediaError)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("keeps a row pending when resolving Graph media fails", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockRejectedValue(new Error("Graph timeout"))

    const result = ensureAttachmentMirrored({
      attachmentId: pending.id,
      workspaceId,
    })

    await expect(result).rejects.toThrow("Graph timeout")
    await expect(result).rejects.not.toBeInstanceOf(TerminalMediaError)
    expect(mocks.updateAttachment).not.toHaveBeenCalled()
  })

  test("marks a pending attachment as permanently unresolvable", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])

    await markAttachmentUnresolvable({
      attachmentId: pending.id,
      workspaceId,
    })

    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pending.id,
        fields: expect.objectContaining({ originPath: "failed:unresolvable" }),
      }),
    )
  })

  test("looks the row up by its message time when marking it unresolvable", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])

    await markAttachmentUnresolvable({
      attachmentId: pending.id,
      workspaceId,
      messageCreatedAt,
    })

    expect(mocks.findAttachmentById).toHaveBeenCalledWith(
      expect.objectContaining({ messageCreatedAt }),
    )
  })

  test("marks a missing message source id as permanently unresolvable", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.findById.mockResolvedValue({
      ...messageWith([pending]),
      sourceId: null,
    })

    await expect(
      ensureAttachmentMirrored({
        attachmentId: pending.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({ reason: "unresolvable" })

    expect(mocks.updateAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pending.id,
        fields: expect.objectContaining({ originPath: "failed:unresolvable" }),
      }),
    )
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("throws terminally without overwriting a no-strategy channel origin path", async () => {
    const pending = attachment("101", "https://tiktok.example/video.mp4")
    arrangeAttachmentGraph([pending])
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "tiktok",
      inboxId: "inbox-1",
      sourceId: "tiktok-user-1",
    })

    await expect(
      ensureAttachmentMirrored({
        attachmentId: pending.id,
        workspaceId,
      }),
    ).rejects.toMatchObject({ reason: "unresolvable" })

    expect(mocks.updateAttachment).not.toHaveBeenCalled()
    expect(pending.originPath).toBe("https://tiktok.example/video.mp4")
  })

  test("leaves an attachment pending when object storage fails transiently", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    mocks.putObject.mockRejectedValue(new Error("R2 unavailable"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )

    await expect(
      ensureAttachmentMirrored({
        attachmentId: pending.id,
        workspaceId,
      }),
    ).rejects.toThrow("R2 unavailable")

    expect(mocks.updateAttachment).not.toHaveBeenCalled()
  })

  test("deduplicates concurrent mirrors under the message lock", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([
      {
        sourceId: "source-101",
        url: "https://fresh.example/101",
        mimeType: "image/jpeg",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    )
    mocks.updateAttachment.mockImplementation(
      ({ id, fields }: { id: string; fields: { originPath: string } }) => {
        const row = pending.id === id ? pending : undefined
        if (row) {
          row.originPath = fields.originPath
        }
      },
    )

    const input = {
      attachmentId: pending.id,
      workspaceId,
    }
    const [first, second] = await Promise.all([
      ensureAttachmentMirrored(input),
      ensureAttachmentMirrored(input),
    ])

    expect(first).toEqual(second)
    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
    expect(mocks.putObject).toHaveBeenCalledTimes(1)
  })

  test("returns an existing avatar without fetching a profile", async () => {
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({
      id: "contact-1",
      avatar: "workspace/workspace-1/avatar.jpg",
    })

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: "workspace/workspace-1/avatar.jpg" })

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
  })

  test("returns a raw avatar URL through the registered channel handler", async () => {
    const contactInbox = {
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    }
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: { auth: { tokens: { accessToken: "access-token" } } },
      integration: { runChannelHandler: mocks.runChannelHandler },
      integrationRow: { id: "integration-1" },
    })
    mocks.runChannelHandler.mockResolvedValue(
      "https://cdn.example/profile-pic.jpg",
    )

    await expect(
      resolveFreshContactAvatarUrl({
        contactInboxId: contactInbox.id,
        workspaceId,
      }),
    ).resolves.toBe("https://cdn.example/profile-pic.jpg")

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getContactProfilePicUrl",
      expect.objectContaining({ data: { sourceId: "psid-1" } }),
    )
  })

  test("returns null when the contact inbox does not exist", async () => {
    mocks.findContactInbox.mockResolvedValue(null)

    await expect(
      resolveFreshContactAvatarUrl({
        contactInboxId: "missing-contact-inbox",
        workspaceId,
      }),
    ).resolves.toBeNull()

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
  })

  test("logs integration failures while resolving a fresh avatar URL", async () => {
    const { IntegrationException } = await import("@chatbotx.io/sdk")
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: { auth: { tokens: { accessToken: "access-token" } } },
      integration: { runChannelHandler: mocks.runChannelHandler },
      integrationRow: { id: "integration-1" },
    })
    const err = new IntegrationException("Graph unavailable")
    mocks.runChannelHandler.mockRejectedValue(err)

    await expect(
      resolveFreshContactAvatarUrl({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toBeNull()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err, contactInboxId: "contact-inbox-1" },
      expect.stringContaining("fresh contact avatar"),
    )
  })

  test("fetches and conditionally persists a pending avatar", async () => {
    const contactInbox = {
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    }
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: { auth: { tokens: { accessToken: "access-token" } } },
      integration: { runChannelHandler: mocks.runChannelHandler },
      integrationRow: { id: "integration-1" },
    })
    mocks.runChannelHandler.mockResolvedValue({
      sourceId: "psid-1",
      avatar: "workspace/workspace-1/avatar.jpg",
    })

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: contactInbox.id,
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: "workspace/workspace-1/avatar.jpg" })

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      expect.objectContaining({ data: { sourceId: "psid-1" } }),
    )
    expect(mocks.setAvatarIfEmptyOrSentinel).toHaveBeenCalledWith({
      workspaceId,
      contactId: "contact-1",
      avatar: "workspace/workspace-1/avatar.jpg",
    })
  })

  test("persists and returns a sentinel when the profile has no avatar", async () => {
    const failedAtMs = Date.now()
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {},
      integration: { runChannelHandler: mocks.runChannelHandler },
    })
    mocks.runChannelHandler.mockResolvedValue({
      sourceId: "psid-1",
      avatar: null,
    })

    const result = await ensureContactAvatarMirrored({
      contactInboxId: "contact-inbox-1",
      workspaceId,
    })

    expect(result?.avatar).toMatch(NO_AVATAR_SENTINEL_PATTERN)
    expect(Number(result?.avatar.split("=")[1])).toBeGreaterThanOrEqual(
      failedAtMs,
    )
    expect(mocks.setAvatarIfEmptyOrSentinel).toHaveBeenCalledWith({
      workspaceId,
      contactId: "contact-1",
      avatar: result?.avatar,
    })
  })

  test.each([
    ["MessengerAPIException", new MessengerAPIException("Graph unavailable")],
    [
      "ChannelError",
      new ChannelError("Graph unavailable", ChannelErrorCategory.UNKNOWN),
    ],
    ["SdkException", new SdkException("Graph unavailable")],
    ["Error", new Error("Graph unavailable")],
  ])("stores a sentinel when getProfile throws %s", async (_name, err) => {
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {},
      integration: { runChannelHandler: mocks.runChannelHandler },
    })
    mocks.runChannelHandler.mockRejectedValue(err)

    const result = await ensureContactAvatarMirrored({
      contactInboxId: "contact-inbox-1",
      workspaceId,
    })

    expect(result?.avatar).toMatch(NO_AVATAR_SENTINEL_PATTERN)
    expect(mocks.setAvatarIfEmptyOrSentinel).toHaveBeenCalledWith({
      workspaceId,
      contactId: "contact-1",
      avatar: result?.avatar,
    })
    // The error is logged through toLogSafeError (a safe {name,message,stack}
    // shape), never the raw error, so a refresh URL/token can never leak here.
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: "Graph unavailable" }),
        contactInboxId: "contact-inbox-1",
        workspaceId,
      },
      "Contact avatar mirror failed; storing no-avatar sentinel",
    )
  })

  test("stores a sentinel when integration context resolution throws", async () => {
    const err = new ChannelError(
      "Channel disconnected",
      ChannelErrorCategory.AUTH_FAILED,
    )
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
    mocks.resolveIntegrationContext.mockRejectedValue(err)

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: expect.stringContaining("?time=") })

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("returns a sentinel when the contact inbox lookup throws", async () => {
    mocks.findContactInbox.mockRejectedValue(new Error("Database unavailable"))

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: expect.stringContaining("?time=") })
  })

  test("returns a fresh sentinel without fetching a profile", async () => {
    const avatar = `public/img/no_avatar.jpg?time=${Date.now()}`
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar })

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar })

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("refetches a stale sentinel", async () => {
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({
      id: "contact-1",
      avatar: "public/img/no_avatar.jpg?time=0",
    })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {},
      integration: { runChannelHandler: mocks.runChannelHandler },
    })
    mocks.runChannelHandler.mockResolvedValue({
      sourceId: "psid-1",
      avatar: "public/avatars/refreshed.jpg",
    })

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: "public/avatars/refreshed.jpg" })

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
  })

  test("returns the fetched avatar and warns when persistence fails", async () => {
    const err = new Error("Database unavailable")
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: {},
      integration: { runChannelHandler: mocks.runChannelHandler },
    })
    mocks.runChannelHandler.mockResolvedValue({
      sourceId: "psid-1",
      avatar: "public/avatars/refreshed.jpg",
    })
    mocks.setAvatarIfEmptyOrSentinel.mockRejectedValue(err)

    await expect(
      ensureContactAvatarMirrored({
        contactInboxId: "contact-inbox-1",
        workspaceId,
      }),
    ).resolves.toEqual({ avatar: "public/avatars/refreshed.jpg" })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err, contactInboxId: "contact-inbox-1", workspaceId },
      "Failed to persist mirrored avatar",
    )
  })

  test("exposes the permanent size error type for shared download callers", () => {
    expect(new AttachmentTooLargeError("too large")).toBeInstanceOf(Error)
  })
})

describe("media download safety", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mocks.retrieveMedia.mockResolvedValue({
      url: "https://fresh.example/whatsapp",
      mime_type: "video/mp4",
    })
  })

  test("caps a streamed body when content-length is absent", async () => {
    const chunk = new Uint8Array(10 * 1024 * 1024)
    let reads = 0
    const response = {
      headers: new Headers(),
      body: {
        getReader: () => ({
          read: () => {
            reads += 1
            return Promise.resolve({ done: false, value: chunk })
          },
          cancel: vi.fn(),
        }),
      },
    } as unknown as Response

    await expect(readBodyWithCap(response, "Messenger")).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    )
    expect(reads).toBeGreaterThan(10)
  })

  test("enforces the size cap for WhatsApp downloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(new Uint8Array([1]), {
            headers: {
              "content-length": String(MAX_ATTACHMENT_BYTES + 1),
              "content-type": "video/mp4",
            },
          }),
        ),
      ),
    )

    await expect(
      downloadWhatsappMedia(
        "media-101",
        { tokens: { accessToken: "whatsapp-token" } } as never,
        "video/mp4",
      ),
    ).rejects.toBeInstanceOf(AttachmentTooLargeError)
  })

  test("passes an AbortSignal timeout to media downloads", async () => {
    let capturedSignal: AbortSignal | null | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal
        return Promise.reject(
          new DOMException("The operation was aborted", "AbortError"),
        )
      }),
    )

    await expect(
      downloadBearerUrlMedia({
        url: "https://fresh.example/media.jpg",
        accessToken: "page-token",
        fallbackMime: "image/jpeg",
        label: "Messenger",
      }),
    ).rejects.toThrow("aborted")

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
  })

  test("downloads Instagram media with its bearer token", async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      downloadBearerUrlMedia({
        url: "https://fresh.example/instagram.jpg",
        accessToken: "instagram-token",
        fallbackMime: "image/jpeg",
        label: "Instagram",
      }),
    ).resolves.toMatchObject({ mimeType: "image/jpeg", size: 3 })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fresh.example/instagram.jpg",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer instagram-token",
        }),
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
