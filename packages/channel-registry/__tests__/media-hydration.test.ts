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

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: mocks.runExclusive,
  },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn: mocks.loggerWarn }),
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
  ensureContactAvatarMirrored,
  markAttachmentUnresolvable,
  MAX_ATTACHMENT_BYTES,
  readBodyWithCap,
  resolveFreshContactAvatarUrl,
  resolveFreshMediaUrl,
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
  mimeType: string
  size: number
  createdAt: Date
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
  mimeType: "image/jpeg",
  size: 0,
  createdAt: attachmentCreatedAt,
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
      originPath: "workspace/workspace-1/storage-2.png",
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
            originPath: "workspace/workspace-1/storage-1.jpg",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "102",
          fields: expect.objectContaining({
            originPath: "workspace/workspace-1/storage-2.png",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "103",
          fields: expect.objectContaining({
            originPath: "workspace/workspace-1/storage-3.jpg",
          }),
        }),
      ],
    ])
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
      originPath: "workspace/workspace-1/storage-1.jpg",
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
      originPath: "workspace/workspace-1/storage-2.png",
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
            originPath: "workspace/workspace-1/storage-1.jpg",
          }),
        }),
      ],
      [
        expect.objectContaining({
          id: "102",
          fields: expect.objectContaining({
            originPath: "workspace/workspace-1/storage-2.png",
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
    ).resolves.toEqual({ originPath: "workspace/workspace-1/storage-1.jpg" })

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
      ensureAttachmentMirrored({ attachmentId: "102", workspaceId }),
    ).resolves.toEqual({ originPath: "workspace/workspace-1/storage-2.png" })
  })

  test("keeps a row pending when Graph resolves no media", async () => {
    const pending = attachment("101")
    arrangeAttachmentGraph([pending])
    mocks.runChannelHandler.mockResolvedValue([])

    const result = ensureAttachmentMirrored({
      attachmentId: pending.id,
      workspaceId,
    })

    await expect(result).rejects.toThrow(UNAVAILABLE_PATTERN)
    await expect(result).rejects.not.toBeInstanceOf(TerminalMediaError)
    expect(mocks.putObject).not.toHaveBeenCalled()
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
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err, contactInboxId: "contact-inbox-1", workspaceId },
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
