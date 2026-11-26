// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com",
  })),
}))

const { createAvatarFinalizer } = await import("../avatar-finalizer")
const { resolveTenantSettings } = await import("@chatbotx.io/business")

describe("createAvatarFinalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("keeps the storage key for the builder UI without reading tenant settings", async () => {
    const finalize = createAvatarFinalizer("1")

    expect(await finalize("ws/1/avatars/a.jpg")).toBe("ws/1/avatars/a.jpg")
    expect(resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("turns a storage key into an absolute URL for public API callers", async () => {
    const finalize = createAvatarFinalizer("1", { publicUrls: true })

    expect(await finalize("ws/1/avatars/a.jpg")).toBe(
      "https://cdn.example.com/ws/1/avatars/a.jpg",
    )
    expect(resolveTenantSettings).toHaveBeenCalledWith({ workspaceId: "1" })
  })

  test("leaves an absolute http(s) avatar (mirrored external) untouched", async () => {
    const finalize = createAvatarFinalizer("1", { publicUrls: true })

    expect(await finalize("https://graph.example.com/a.jpg")).toBe(
      "https://graph.example.com/a.jpg",
    )
  })

  test("does not read tenant settings until a key is finalized", () => {
    createAvatarFinalizer("1", { publicUrls: true })

    expect(resolveTenantSettings).not.toHaveBeenCalled()
  })

  test("reads tenant settings once however many keys it finalizes", async () => {
    const finalize = createAvatarFinalizer("1", { publicUrls: true })

    await Promise.all(["a.jpg", "b.jpg", "c.jpg"].map((key) => finalize(key)))

    expect(resolveTenantSettings).toHaveBeenCalledTimes(1)
  })
})
