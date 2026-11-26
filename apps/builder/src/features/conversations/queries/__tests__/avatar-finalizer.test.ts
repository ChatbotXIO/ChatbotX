// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com",
  })),
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  toPublicStorageUrl: vi.fn((key: string, base: string) => `${base}/${key}`),
}))

const { createAvatarFinalizer } = await import("../avatar-finalizer")
const { resolveTenantSettings } = await import("@chatbotx.io/business")

describe("createAvatarFinalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("keeps the storage key for the builder UI without reading tenant settings", async () => {
    const finalize = await createAvatarFinalizer("1")

    expect(finalize("ws/1/avatars/a.jpg")).toBe("ws/1/avatars/a.jpg")
    expect(resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("turns a storage key into an absolute URL for public API callers", async () => {
    const finalize = await createAvatarFinalizer("1", { publicUrls: true })

    expect(finalize("ws/1/avatars/a.jpg")).toBe(
      "https://cdn.example.com/ws/1/avatars/a.jpg",
    )
    expect(resolveTenantSettings).toHaveBeenCalledWith({ workspaceId: "1" })
  })
})
