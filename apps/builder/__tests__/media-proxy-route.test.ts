// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class TerminalMediaError extends Error {}

  return {
    TerminalMediaError,
    checkGuestRateLimit: vi.fn(),
    createMessageRepository: vi.fn(),
    findAttachmentById: vi.fn(),
    findContact: vi.fn(),
    findContactInbox: vi.fn(),
    getPresignedDownload: vi.fn(),
    getPublicFileUrl: vi.fn(),
    loadServableWorkspace: vi.fn(),
    lowQueueAdd: vi.fn(),
    resolveFreshContactAvatarUrl: vi.fn(),
    resolveFreshMediaUrl: vi.fn(),
    resolveIntegrationForAttachment: vi.fn(),
    resolveGuestRateLimitKey: vi.fn(),
    resolveTenantSettings: vi.fn(),
    verifyMediaToken: vi.fn(),
  }
})

vi.mock("@chatbotx.io/encryption", () => ({
  verifyMediaToken: mocks.verifyMediaToken,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findByUncached: mocks.findContactInbox },
  contactService: { findById: mocks.findContact },
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
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: mocks.getPublicFileUrl,
}))

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  resolveFreshContactAvatarUrl: mocks.resolveFreshContactAvatarUrl,
  resolveFreshMediaUrl: mocks.resolveFreshMediaUrl,
  resolveIntegrationForAttachment: mocks.resolveIntegrationForAttachment,
  TerminalMediaError: mocks.TerminalMediaError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedDownload: mocks.getPresignedDownload },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    coexistAttachmentDownload: "coexistAttachmentDownload",
    updateContactAvatar: "updateContactAvatar",
  },
  lowQueue: { add: mocks.lowQueueAdd },
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit: mocks.checkGuestRateLimit,
  resolveGuestRateLimitKey: mocks.resolveGuestRateLimitKey,
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace: mocks.loadServableWorkspace,
}))

const { GET: getAttachment } = await import(
  "../src/app/media/attachment/[token]/route"
)
const { GET: getAvatar } = await import("../src/app/media/avatar/[token]/route")

const tokenContext = (token = "signed-token") => ({
  params: Promise.resolve({ token }),
})

const attachment = (
  originPath = "https://cdn.example/pending.jpg",
  id = "attachment-1",
) => ({
  id,
  messageId: "message-1",
  messageCreatedAt: new Date("2026-09-20T00:00:00.000Z"),
  sourceId: "source-1",
  originPath,
  mimeType: "image/jpeg",
  createdAt: new Date("2026-09-20T00:00:01.000Z"),
})

describe("attachment media proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkGuestRateLimit.mockResolvedValue({
      limited: false,
      retryAfter: 10,
    })
    mocks.loadServableWorkspace.mockResolvedValue({ servable: true })
    mocks.createMessageRepository.mockResolvedValue({
      findAttachmentById: mocks.findAttachmentById,
    })
    mocks.lowQueueAdd.mockResolvedValue(undefined)
    mocks.resolveIntegrationForAttachment.mockResolvedValue({
      channel: "messenger",
      integrationRow: { id: "integration-1" },
    })
    mocks.resolveGuestRateLimitKey.mockReturnValue("203.0.113.10")
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      expiresAt: Date.now() + 60_000,
    })
  })

  test("returns 404 for an invalid token", async () => {
    mocks.verifyMediaToken.mockResolvedValue(null)

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/bad") as never,
      tokenContext("bad"),
    )

    expect(response.status).toBe(404)
    expect(mocks.findAttachmentById).not.toHaveBeenCalled()
  })

  test("returns 404 when token verification rejects", async () => {
    mocks.verifyMediaToken.mockRejectedValue(new Error("invalid signature"))

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/tampered") as never,
      tokenContext("tampered"),
    )

    expect(response.status).toBe(404)
    expect(mocks.findAttachmentById).not.toHaveBeenCalled()
  })

  test("returns 404 when an avatar token is used on the attachment route", async () => {
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "contact-inbox-1",
      expiresAt: Date.now() + 60_000,
    })

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/avatar-token") as never,
      tokenContext("avatar-token"),
    )

    expect(response.status).toBe(404)
    expect(mocks.findAttachmentById).not.toHaveBeenCalled()
  })

  test("returns 410 for a non-servable workspace", async () => {
    mocks.loadServableWorkspace.mockResolvedValue({ servable: false })

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(410)
    expect(mocks.findAttachmentById).not.toHaveBeenCalled()
  })

  test("redirects mirrored media to a fresh presigned URL without Graph", async () => {
    mocks.findAttachmentById.mockResolvedValue(
      attachment("workspace/workspace-1/media.jpg"),
    )
    mocks.getPresignedDownload.mockResolvedValue(
      "https://storage.example/presigned-media.jpg",
    )

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://storage.example/presigned-media.jpg",
    )
    expect(mocks.resolveFreshMediaUrl).not.toHaveBeenCalled()
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test("degrades to the unavailable placeholder when mirrored presigning fails", async () => {
    mocks.findAttachmentById.mockResolvedValue(
      attachment("workspace/workspace-1/media.jpg"),
    )
    mocks.getPresignedDownload.mockRejectedValue(new Error("signer down"))

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/unavailable.svg",
    )
  })

  test("redirects pending media to a fresh CDN URL and enqueues one message job", async () => {
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockResolvedValue({
      channel: "messenger",
      integrationId: "integration-1",
      url: "https://cdn.example/fresh.jpg",
      mimeType: "image/jpeg",
    })

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://cdn.example/fresh.jpg",
    )
    expect(mocks.resolveFreshMediaUrl).toHaveBeenCalledTimes(1)
    expect(mocks.resolveIntegrationForAttachment).not.toHaveBeenCalled()
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "coexistAttachmentDownload",
      {
        type: "coexistAttachmentDownload",
        data: {
          attachmentId: "attachment-1",
          workspaceId: "workspace-1",
          channel: "messenger",
          integrationId: "integration-1",
        },
      },
      expect.objectContaining({ jobId: "media-message-message-1" }),
    )
  })

  test("forwards the token's messageCreatedAt hint to the shard lookup", async () => {
    const messageCreatedAtMs = Date.parse("2026-09-20T00:00:00.000Z")
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      messageCreatedAt: messageCreatedAtMs,
      expiresAt: Date.now() + 60_000,
    })
    mocks.findAttachmentById.mockResolvedValue(attachment("stored/att-1.jpg"))
    mocks.getPresignedDownload.mockResolvedValue(
      "https://cdn.example/signed.jpg",
    )

    await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(mocks.findAttachmentById).toHaveBeenCalledWith({
      id: "attachment-1",
      workspaceId: "workspace-1",
      messageCreatedAt: new Date(messageCreatedAtMs),
    })
  })

  test("forwards the hint to the re-read lookup on the pending path", async () => {
    const messageCreatedAtMs = Date.parse("2026-09-20T00:00:00.000Z")
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      messageCreatedAt: messageCreatedAtMs,
      expiresAt: Date.now() + 60_000,
    })
    // Pending origin path → the route re-reads the attachment after a fresh
    // resolve returns nothing, exercising the second findAttachmentById call.
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockResolvedValue(null)

    await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(mocks.findAttachmentById).toHaveBeenNthCalledWith(2, {
      id: "attachment-1",
      workspaceId: "workspace-1",
      messageCreatedAt: new Date(messageCreatedAtMs),
    })
  })

  test("forwards a zero-epoch hint as Date(0) rather than dropping it", async () => {
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
      messageCreatedAt: 0,
      expiresAt: Date.now() + 60_000,
    })
    mocks.findAttachmentById.mockResolvedValue(attachment("stored/att-1.jpg"))
    mocks.getPresignedDownload.mockResolvedValue(
      "https://cdn.example/signed.jpg",
    )

    await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(mocks.findAttachmentById).toHaveBeenCalledWith({
      id: "attachment-1",
      workspaceId: "workspace-1",
      messageCreatedAt: new Date(0),
    })
  })

  test("coalesces attachments from one message under the same job id", async () => {
    mocks.resolveFreshMediaUrl.mockResolvedValue({
      channel: "messenger",
      integrationId: "integration-1",
      url: "https://cdn.example/fresh.jpg",
      mimeType: "image/jpeg",
    })
    mocks.findAttachmentById
      .mockResolvedValueOnce(attachment(undefined, "attachment-1"))
      .mockResolvedValueOnce(attachment(undefined, "attachment-2"))

    await getAttachment(
      new Request("http://localhost/media/attachment/token-1") as never,
      tokenContext("token-1"),
    )
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-2",
      expiresAt: Date.now() + 60_000,
    })
    await getAttachment(
      new Request("http://localhost/media/attachment/token-2") as never,
      tokenContext("token-2"),
    )

    const jobIds = mocks.lowQueueAdd.mock.calls.map((call) => call[2].jobId)
    expect(jobIds).toEqual([
      "media-message-message-1",
      "media-message-message-1",
    ])
    expect(jobIds.every((jobId) => !jobId.includes(":"))).toBe(true)
  })

  test("redirects unresolved pending media to the processing placeholder", async () => {
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockResolvedValue(null)

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/processing.svg",
    )
    expect(mocks.findAttachmentById).toHaveBeenCalledTimes(2)
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("builds placeholders from the forwarded public origin", async () => {
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockResolvedValue(null)

    const response = await getAttachment(
      new Request("http://builder:3123/media/attachment/signed-token", {
        headers: {
          "x-forwarded-host": "chat.example.com",
          "x-forwarded-proto": "https",
        },
      }) as never,
      tokenContext(),
    )

    expect(response.headers.get("location")).toBe(
      "https://chat.example.com/media/processing.svg",
    )
  })

  test("redirects to mirrored media when the background job wins the race", async () => {
    mocks.findAttachmentById
      .mockResolvedValueOnce(attachment())
      .mockResolvedValueOnce(attachment("workspace/workspace-1/media.jpg"))
    mocks.resolveFreshMediaUrl.mockResolvedValue(null)
    mocks.getPresignedDownload.mockResolvedValue(
      "https://storage.example/presigned-media.jpg",
    )

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.headers.get("location")).toBe(
      "https://storage.example/presigned-media.jpg",
    )
  })

  test("redirects terminal media to the unavailable placeholder", async () => {
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockRejectedValue(
      new mocks.TerminalMediaError("unresolvable"),
    )

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/unavailable.svg",
    )
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test("enqueues retryable Graph failures and redirects to processing", async () => {
    mocks.findAttachmentById.mockResolvedValue(attachment())
    mocks.resolveFreshMediaUrl.mockRejectedValue(new Error("Graph unavailable"))

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/processing.svg",
    )
    await vi.waitFor(() => expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1))
  })

  test("uses the media-specific workspace IP key and request budgets", async () => {
    mocks.findAttachmentById.mockResolvedValue(
      attachment("workspace/workspace-1/media.jpg"),
    )
    mocks.getPresignedDownload.mockResolvedValue(
      "https://storage.example/presigned-media.jpg",
    )

    await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(mocks.resolveGuestRateLimitKey).toHaveBeenCalledWith(
      expect.any(Headers),
      "workspace-1",
    )
    expect(mocks.checkGuestRateLimit).toHaveBeenCalledWith({
      webchatId: "media-proxy",
      clientIp: "203.0.113.10",
      guestConversationId: "signed-token",
      ipLimit: 600,
      sessionLimit: 20,
    })
  })

  test("rate limits replay by token and IP", async () => {
    mocks.checkGuestRateLimit.mockResolvedValue({
      limited: true,
      retryAfter: 7,
    })

    const response = await getAttachment(
      new Request("http://localhost/media/attachment/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("7")
    expect(mocks.findAttachmentById).not.toHaveBeenCalled()
  })
})

describe("avatar media proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkGuestRateLimit.mockResolvedValue({
      limited: false,
      retryAfter: 10,
    })
    mocks.loadServableWorkspace.mockResolvedValue({ servable: true })
    mocks.lowQueueAdd.mockResolvedValue(undefined)
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://storage.example",
    })
    mocks.resolveGuestRateLimitKey.mockReturnValue("203.0.113.10")
    mocks.verifyMediaToken.mockResolvedValue({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "contact-inbox-1",
      expiresAt: Date.now() + 60_000,
    })
    mocks.findContactInbox.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "messenger",
      sourceId: "psid-1",
    })
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar: null })
  })

  test("redirects a mirrored avatar to its public URL", async () => {
    mocks.findContact.mockResolvedValue({
      id: "contact-1",
      avatar: "workspace/workspace-1/avatar.jpg",
    })
    mocks.getPublicFileUrl.mockReturnValue(
      "https://storage.example/workspace/workspace-1/avatar.jpg",
    )

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://storage.example/workspace/workspace-1/avatar.jpg",
    )
    expect(mocks.resolveFreshContactAvatarUrl).not.toHaveBeenCalled()
  })

  test("redirects a fresh no-avatar sentinel to the default placeholder", async () => {
    const avatar = `public/img/no_avatar.jpg?time=${Date.now()}`
    mocks.findContact.mockResolvedValue({ id: "contact-1", avatar })

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/default-avatar.svg",
    )
    // The sentinel key is never served directly, so a missing tenant
    // `no_avatar.jpg` object cannot surface as a broken image.
    expect(mocks.getPublicFileUrl).not.toHaveBeenCalled()
    expect(mocks.resolveFreshContactAvatarUrl).not.toHaveBeenCalled()
  })

  test("refetches a stale no-avatar sentinel and enqueues mirroring", async () => {
    mocks.findContact.mockResolvedValue({
      id: "contact-1",
      avatar: "public/img/no_avatar.jpg?time=0",
    })
    mocks.resolveFreshContactAvatarUrl.mockResolvedValue(
      "https://cdn.example/profile-pic.jpg",
    )

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://cdn.example/profile-pic.jpg",
    )
    expect(mocks.getPublicFileUrl).not.toHaveBeenCalled()
    expect(mocks.resolveFreshContactAvatarUrl).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      workspaceId: "workspace-1",
    })
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("redirects a pending avatar to profile_pic and enqueues mirroring", async () => {
    mocks.resolveFreshContactAvatarUrl.mockResolvedValue(
      "https://cdn.example/profile-pic.jpg",
    )

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://cdn.example/profile-pic.jpg",
    )
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "updateContactAvatar",
      {
        type: "updateContactAvatar",
        data: {
          workspaceId: "workspace-1",
          contactInboxId: "contact-inbox-1",
          sourceId: "psid-1",
        },
      },
      expect.objectContaining({ jobId: "update-avatar-contact-inbox-1" }),
    )
  })

  test("redirects an unsupported avatar and enqueues sentinel persistence", async () => {
    mocks.findContact.mockResolvedValue({
      id: "contact-1",
      avatar: "public/img/no_avatar.jpg?time=0",
    })
    mocks.resolveFreshContactAvatarUrl.mockResolvedValue(null)

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/default-avatar.svg",
    )
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      "updateContactAvatar",
      {
        type: "updateContactAvatar",
        data: {
          workspaceId: "workspace-1",
          contactInboxId: "contact-inbox-1",
          sourceId: "psid-1",
        },
      },
      expect.objectContaining({ jobId: "update-avatar-contact-inbox-1" }),
    )
  })

  test("redirects terminal avatar failures to the default placeholder", async () => {
    mocks.resolveFreshContactAvatarUrl.mockRejectedValue(
      new mocks.TerminalMediaError("unresolvable"),
    )

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/default-avatar.svg",
    )
    // Terminal failures still mirror once so the worker persists the
    // no-avatar sentinel; otherwise every render would re-hit Graph.
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("degrades a transient avatar failure to the placeholder and enqueues mirroring", async () => {
    mocks.resolveFreshContactAvatarUrl.mockRejectedValue(
      new Error("graph timeout"),
    )

    const response = await getAvatar(
      new Request("http://localhost/media/avatar/signed-token") as never,
      tokenContext(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3123/media/default-avatar.svg",
    )
    // A transient (non-terminal) failure degrades to the placeholder instead
    // of a broken 502, and mirrors best-effort.
    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
  })
})
