import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  resolveWorkspaceAppUrl: vi.fn(async () => "https://builder.example.com"),
  signMediaToken: vi.fn(async () => "signed-media-token"),
}))

vi.mock("@chatbotx.io/encryption", () => ({
  signMediaToken: mocks.signMediaToken,
}))

vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: mocks.resolveWorkspaceAppUrl,
}))

vi.mock("../../logger", () => ({
  logger: { warn: mocks.loggerWarn },
}))

import { resolveContactAvatarUrl, resolveMediaUrl } from "../resolve-media-url"

describe("resolveMediaUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("finalizes a mirrored attachment using the caller's URL form", async () => {
    const finalize = vi.fn(async (key: string) => `presigned:${key}`)

    const result = await resolveMediaUrl(
      {
        kind: "attachment",
        workspaceId: "workspace-1",
        attachmentId: "attachment-1",
        originPath: "workspace/media/image.jpg",
        channel: "messenger",
      },
      finalize,
    )

    expect(result).toBe("presigned:workspace/media/image.jpg")
    expect(finalize).toHaveBeenCalledWith("workspace/media/image.jpg")
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns a signed proxy URL for a pending hydration-channel attachment", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveMediaUrl(
      {
        kind: "attachment",
        workspaceId: "workspace-1",
        attachmentId: "attachment-1",
        originPath: "https://lookaside.facebook.com/media",
        channel: "instagram",
      },
      finalize,
    )

    expect(result).toBe(
      "https://builder.example.com/media/attachment/signed-media-token",
    )
    expect(mocks.signMediaToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "attachment",
      refId: "attachment-1",
    })
    expect(finalize).not.toHaveBeenCalled()
  })

  test("finalizes an external URL for a non-hydration channel", async () => {
    const finalize = vi.fn(async (key: string) => `final:${key}`)

    const result = await resolveMediaUrl(
      {
        kind: "attachment",
        workspaceId: "workspace-1",
        attachmentId: "attachment-1",
        originPath: "https://cdn.tiktok.example/media.jpg",
        channel: "tiktok",
      },
      finalize,
    )

    expect(result).toBe("final:https://cdn.tiktok.example/media.jpg")
    expect(finalize).toHaveBeenCalledWith(
      "https://cdn.tiktok.example/media.jpg",
    )
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns null for a permanently failed attachment", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveMediaUrl(
      {
        kind: "attachment",
        workspaceId: "workspace-1",
        attachmentId: "attachment-1",
        originPath: "failed:unresolvable",
        channel: "messenger",
      },
      finalize,
    )

    expect(result).toBeNull()
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns a signed proxy URL for pending WhatsApp media", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveMediaUrl(
      {
        kind: "attachment",
        workspaceId: "workspace-1",
        attachmentId: "attachment-1",
        originPath: "wa-media:media-id-1",
        channel: "whatsapp",
      },
      finalize,
    )

    expect(result).toBe(
      "https://builder.example.com/media/attachment/signed-media-token",
    )
    expect(finalize).not.toHaveBeenCalled()
  })

  test("returns a signed proxy URL for an unresolved Messenger avatar", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: null,
      },
      finalize,
    )

    expect(result).toBe(
      "https://builder.example.com/media/avatar/signed-media-token",
    )
    expect(mocks.signMediaToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "contact-inbox-1",
    })
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.resolveWorkspaceAppUrl).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("builds the proxy URL on the workspace's white-label domain", async () => {
    mocks.resolveWorkspaceAppUrl.mockResolvedValueOnce("https://chat.acme.com")

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: null,
      },
      vi.fn(async (key: string) => key),
    )

    expect(result).toBe("https://chat.acme.com/media/avatar/signed-media-token")
  })

  test("finalizes a synchronously mirrored Messenger avatar", async () => {
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn().mockResolvedValue({
      avatar: "public/space/workspace-1/avatars/mirrored.png",
    })

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: null,
      },
      finalize,
      ensureMirrored,
    )

    expect(result).toBe("public:public/space/workspace-1/avatars/mirrored.png")
    expect(ensureMirrored).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      workspaceId: "workspace-1",
    })
    expect(finalize).toHaveBeenCalledWith(
      "public/space/workspace-1/avatars/mirrored.png",
    )
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns null when synchronous Messenger avatar mirroring fails", async () => {
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn().mockResolvedValue(null)

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: null,
      },
      finalize,
      ensureMirrored,
    )

    expect(result).toBeNull()
    expect(ensureMirrored).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      workspaceId: "workspace-1",
    })
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns null when synchronous Messenger avatar mirroring rejects", async () => {
    const err = new Error("Graph unavailable")
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn().mockRejectedValue(err)

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: null,
      },
      finalize,
      ensureMirrored,
    )

    expect(result).toBeNull()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        err,
        contactInboxId: "contact-inbox-1",
        workspaceId: "workspace-1",
      },
      "Synchronous avatar mirror failed; omitting avatar",
    )
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("serves the default avatar for a fresh no-avatar sentinel without rehydrating", async () => {
    const failedAtMs = Date.now()
    const avatar = `public/img/no_avatar.jpg?time=${failedAtMs}`
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn()

    await expect(
      resolveMediaUrl(
        {
          kind: "avatar",
          workspaceId: "workspace-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          avatar,
        },
        finalize,
        ensureMirrored,
      ),
    ).resolves.toBe("https://builder.example.com/media/default-avatar.svg")

    expect(ensureMirrored).not.toHaveBeenCalled()
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.resolveWorkspaceAppUrl).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("rehydrates a stale no-avatar sentinel", async () => {
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn().mockResolvedValue({
      avatar: "public/avatars/refreshed.jpg",
    })

    await expect(
      resolveMediaUrl(
        {
          kind: "avatar",
          workspaceId: "workspace-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          avatar: "public/img/no_avatar.jpg?time=0",
        },
        finalize,
        ensureMirrored,
      ),
    ).resolves.toBe("public:public/avatars/refreshed.jpg")

    expect(ensureMirrored).toHaveBeenCalledTimes(1)
  })

  test("serves the default avatar when the mirror yields a no-avatar sentinel", async () => {
    const finalize = vi.fn(async (key: string) => `public:${key}`)
    const ensureMirrored = vi.fn().mockResolvedValue({
      avatar: `public/img/no_avatar.jpg?time=${Date.now()}`,
    })

    await expect(
      resolveMediaUrl(
        {
          kind: "avatar",
          workspaceId: "workspace-1",
          contactInboxId: "contact-inbox-1",
          channel: "messenger",
          avatar: null,
        },
        finalize,
        ensureMirrored,
      ),
    ).resolves.toBe("https://builder.example.com/media/default-avatar.svg")

    expect(finalize).not.toHaveBeenCalled()
  })

  test("finalizes a mirrored avatar using the caller's URL form", async () => {
    const finalize = vi.fn(async (key: string) => `public:${key}`)

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        avatar: "workspace/workspace-1/avatar.jpg",
      },
      finalize,
    )

    expect(result).toBe("public:workspace/workspace-1/avatar.jpg")
    expect(finalize).toHaveBeenCalledWith("workspace/workspace-1/avatar.jpg")
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("returns null for an unresolved WhatsApp avatar", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveMediaUrl(
      {
        kind: "avatar",
        workspaceId: "workspace-1",
        contactInboxId: "contact-inbox-1",
        channel: "whatsapp",
        avatar: null,
      },
      finalize,
    )

    expect(result).toBeNull()
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })
})

describe("resolveContactAvatarUrl", () => {
  test("returns a proxy URL for a scan-imported Messenger contact", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: null },
        contactInboxes: [
          {
            id: "messenger-contact-inbox",
            channel: "messenger",
          },
        ],
      },
      finalize,
    )

    expect(result).toBe(
      "https://builder.example.com/media/avatar/signed-media-token",
    )
    expect(mocks.signMediaToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "messenger-contact-inbox",
    })
    expect(finalize).not.toHaveBeenCalled()
  })

  test("selects the most recently active hydration-capable contact inbox", async () => {
    const finalize = vi.fn(async (key: string) => `final:${key}`)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: null },
        contactInboxes: [
          {
            id: "whatsapp-newest",
            channel: "whatsapp",
            lastMessageAt: new Date("2026-03-01T00:00:00Z"),
          },
          {
            id: "messenger-older",
            channel: "messenger",
            lastMessageAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            id: "instagram-newer",
            channel: "instagram",
            lastMessageAt: new Date("2026-02-01T00:00:00Z"),
          },
        ],
      },
      finalize,
    )

    expect(result).toBe(
      "https://builder.example.com/media/avatar/signed-media-token",
    )
    expect(mocks.signMediaToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "avatar",
      refId: "instagram-newer",
    })
    expect(finalize).not.toHaveBeenCalled()
  })

  test("finalizes a mirrored avatar without a contact inbox", async () => {
    const finalize = vi.fn(async (key: string) => `final:${key}`)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: "avatars/contact-1.png" },
        contactInboxes: [],
      },
      finalize,
    )

    expect(result).toBe("final:avatars/contact-1.png")
    expect(finalize).toHaveBeenCalledWith("avatars/contact-1.png")
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("serves the default avatar for a sentinel without a contact inbox", async () => {
    const finalize = vi.fn(async (key: string) => `final:${key}`)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: `public/img/no_avatar.jpg?time=${Date.now()}` },
        contactInboxes: [],
      },
      finalize,
    )

    expect(result).toBe("https://builder.example.com/media/default-avatar.svg")
    expect(finalize).not.toHaveBeenCalled()
  })

  test("keeps a mirrored avatar as its raw key with the identity finalizer", async () => {
    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: "avatars/contact-1.png" },
        contactInboxes: [
          {
            id: "messenger-contact-inbox",
            channel: "messenger",
          },
        ],
      },
      (key) => key,
    )

    expect(result).toBe("avatars/contact-1.png")
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("keeps a null avatar for a WhatsApp contact", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: null },
        contactInboxes: [
          {
            id: "whatsapp-contact-inbox",
            channel: "whatsapp",
          },
        ],
      },
      finalize,
    )

    expect(result).toBeNull()
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })

  test("keeps a null avatar when the contact has no inbox", async () => {
    const finalize = vi.fn(async (key: string) => key)

    const result = await resolveContactAvatarUrl(
      {
        workspaceId: "workspace-1",
        contact: { avatar: null },
        contactInboxes: [],
      },
      finalize,
    )

    expect(result).toBeNull()
    expect(finalize).not.toHaveBeenCalled()
    expect(mocks.signMediaToken).not.toHaveBeenCalled()
  })
})
