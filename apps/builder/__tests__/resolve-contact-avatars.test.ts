// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByContactIds: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { listByContactIds: mocks.listByContactIds },
  resolveTenantSettings: mocks.resolveTenantSettings,
  // Mirrors the real resolver: a real key goes through `finalize`.
  resolveContactAvatarUrl: async (
    input: { contact: { avatar: string | null } },
    finalize: (key: string) => string,
  ) => (input.contact.avatar ? finalize(input.contact.avatar) : null),
}))

const { resolveContactAvatars } = await import(
  "@/features/contacts/queries/resolve-contact-avatars"
)

describe("resolveContactAvatars", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listByContactIds.mockResolvedValue([])
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.test",
    })
  })

  test("keeps the storage key for the builder UI", async () => {
    const [contact] = await resolveContactAvatars(
      [{ id: "1", avatar: "ws/a.jpg" }],
      "ws-1",
    )
    expect(contact.avatar).toBe("ws/a.jpg")
    expect(mocks.resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("publicUrls turns the key into an absolute URL, once per call", async () => {
    const result = await resolveContactAvatars(
      [
        { id: "1", avatar: "ws/a.jpg" },
        { id: "2", avatar: null },
      ],
      "ws-1",
      { publicUrls: true },
    )
    expect(result[0].avatar).toContain("https://cdn.test")
    expect(result[0].avatar).toContain("ws/a.jpg")
    expect(result[1].avatar).toBeNull()
    expect(mocks.resolveTenantSettings).toHaveBeenCalledTimes(1)
    expect(mocks.listByContactIds).toHaveBeenCalledTimes(1)
  })
})
