import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureContactAvatarMirrored: vi.fn(),
}))

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureContactAvatarMirrored: mocks.ensureContactAvatarMirrored,
}))

const { updateContactAvatar } = await import(
  "../src/integration/handlers/contact/update-avatar"
)

describe("updateContactAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureContactAvatarMirrored.mockResolvedValue(null)
  })

  test("delegates avatar hydration using the durable contact inbox lookup", async () => {
    await updateContactAvatar({
      workspaceId: "workspace-1",
      contactInboxId: "contact-inbox-1",
      sourceId: "legacy-queued-source-id",
    })

    expect(mocks.ensureContactAvatarMirrored).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactInboxId: "contact-inbox-1",
    })
  })
})
