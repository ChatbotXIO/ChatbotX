import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteMessengerProfileFields: vi.fn(),
  syncPersonas: vi.fn(),
  unsubscribePageFromAppWebhook: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("../src/apis/page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/page")>()
  return {
    ...actual,
    deleteMessengerProfileFields: mocks.deleteMessengerProfileFields,
    syncPersonas: mocks.syncPersonas,
    unsubscribePageFromAppWebhook: mocks.unsubscribePageFromAppWebhook,
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { integration } = await import("../src/integration")

const auth = {
  clientId: "client-1",
  clientSecret: "secret-1",
  tokens: { accessToken: "page-token" },
  metadata: {
    pageId: "page-1",
    version: "v99.0",
  },
} as never

describe("Messenger disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteMessengerProfileFields.mockResolvedValue(undefined)
    mocks.unsubscribePageFromAppWebhook.mockResolvedValue(undefined)
  })

  test("continues to app-token unsubscribe when persistent menu cleanup fails", async () => {
    mocks.deleteMessengerProfileFields.mockRejectedValueOnce(
      new Error("menu cleanup failed"),
    )

    await integration.disconnect?.(auth)

    expect(mocks.deleteMessengerProfileFields).toHaveBeenCalledWith({
      ctx: { auth },
      fields: ["persistent_menu"],
    })
    expect(mocks.unsubscribePageFromAppWebhook).toHaveBeenCalledWith({
      pageId: "page-1",
      appAccessToken: "client-1|secret-1",
      version: "v99.0",
    })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "menu cleanup failed" }),
      expect.any(String),
    )
  })
})
