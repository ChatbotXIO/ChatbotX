// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const findLogo = vi.fn()
const setLogoIfEmpty = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { findLogo, setLogoIfEmpty },
}))

const uploadFileFromUrl = vi.fn()
vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl,
}))

const createId = vi.fn(() => "logo-id")
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId,
  }
})

const { updateWorkspaceLogo } = await import(
  "../src/features/workspaces/actions/upload-logo"
)

function createIntegration(profilePictureUrl?: string) {
  return {
    runChannelHandler: vi.fn(async () => profilePictureUrl),
  }
}

function createFailingIntegration() {
  return {
    runChannelHandler: vi.fn(() =>
      Promise.reject(new Error("profile picture failed")),
    ),
  }
}

function createCtx() {
  return {
    storagePrefix: "public/space/ws-1",
    auth: { authType: "none" as const },
    platform: {
      appUrl: "https://app.example.com",
      publicRealtimeUrl: "wss://realtime.example.com",
      internalRealtimeUrl: "https://realtime.example.com",
      storageUrl: "https://storage.example.com",
      getRealtimeBroadcastAuthHeaders: vi.fn(async () => ({})),
    },
  }
}

function resetMocks() {
  vi.clearAllMocks()
  createId.mockReturnValue("logo-id")
  uploadFileFromUrl.mockResolvedValue({
    originPath: "public/space/ws-1/logos/logo-id.jpg",
  })
  findLogo.mockResolvedValue(null)
  setLogoIfEmpty.mockResolvedValue(true)
}

describe("updateWorkspaceLogo", () => {
  beforeEach(resetMocks)

  test("uploads integration profile picture and stores it when workspace logo is null", async () => {
    const integration = createIntegration("https://example.com/logo.jpg")
    const ctx = createCtx()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx,
    })

    expect(findLogo).toHaveBeenCalledWith({ id: "ws-1", tx: undefined })
    expect(integration.runChannelHandler).toHaveBeenCalledWith(
      "bot",
      "getProfilePictureUrl",
      { ctx },
    )
    expect(uploadFileFromUrl).toHaveBeenCalledWith(
      "https://example.com/logo.jpg",
      "public/space/ws-1/logos/logo-id.jpg",
    )
    expect(setLogoIfEmpty).toHaveBeenCalledWith({
      id: "ws-1",
      logo: "public/space/ws-1/logos/logo-id.jpg",
      tx: undefined,
    })
  })

  test("does not update workspace when integration has no profile picture", async () => {
    const integration = createIntegration()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(setLogoIfEmpty).not.toHaveBeenCalled()
  })

  test("does not update workspace when profile picture lookup fails", async () => {
    const integration = createFailingIntegration()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(setLogoIfEmpty).not.toHaveBeenCalled()
  })

  test("does not update workspace when profile picture upload fails", async () => {
    uploadFileFromUrl.mockRejectedValue(new Error("upload failed"))
    const integration = createIntegration("https://example.com/logo.jpg")

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(setLogoIfEmpty).not.toHaveBeenCalled()
  })

  test("does not fetch or upload profile picture when workspace already has a logo", async () => {
    findLogo.mockResolvedValue("public/space/ws-1/logos/existing.jpg")
    const integration = createIntegration("https://example.com/logo.jpg")

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(integration.runChannelHandler).not.toHaveBeenCalled()
    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(setLogoIfEmpty).not.toHaveBeenCalled()
  })

  test("does nothing when the workspace does not exist", async () => {
    findLogo.mockResolvedValue(undefined)
    const integration = createIntegration("https://example.com/logo.jpg")

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(integration.runChannelHandler).not.toHaveBeenCalled()
    expect(setLogoIfEmpty).not.toHaveBeenCalled()
  })

  test("passes a caller-owned transaction through to the service", async () => {
    const integration = createIntegration("https://example.com/logo.jpg")
    const tx = { marker: "tx" }

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
      tx: tx as never,
    })

    expect(findLogo).toHaveBeenCalledWith({ id: "ws-1", tx })
    expect(setLogoIfEmpty).toHaveBeenCalledWith({
      id: "ws-1",
      logo: "public/space/ws-1/logos/logo-id.jpg",
      tx,
    })
  })
})
