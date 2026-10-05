// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  markTokenRefreshError: vi.fn(async () => ({ phoneNumberId: "phone-1" })),
  markDegradedByIdentifier: vi.fn(async () => null),
  markUnhealthyByIdentifier: vi.fn(async () => null),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/database/repositories")
  >()),
  integrationWhatsappRepository: {
    markTokenRefreshError: mocks.markTokenRefreshError,
  },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    markDegradedByIdentifier: mocks.markDegradedByIdentifier,
    markUnhealthyByIdentifier: mocks.markUnhealthyByIdentifier,
  },
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it must happen after those mocks are registered.
const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

describe("integrationWhatsappService.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.markTokenRefreshError.mockResolvedValue({ phoneNumberId: "phone-1" })
  })

  test("writes the satellite column through the repository, scoped by workspaceId, and degrades the Connection by phoneNumberId", async () => {
    await integrationWhatsappService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
    })
    expect(mocks.markDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "whatsapp",
      identifier: "phone-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
    expect(mocks.markUnhealthyByIdentifier).not.toHaveBeenCalled()
  })

  test("marks the Connection unhealthy when the provider confirms the token was revoked", async () => {
    await integrationWhatsappService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })

    expect(mocks.markUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "whatsapp",
      identifier: "phone-1",
      workspaceId: "ws-1",
      reason: "token_revoked",
    })
    expect(mocks.markDegradedByIdentifier).not.toHaveBeenCalled()
  })

  test("no-ops the engine notification when the satellite row no longer exists", async () => {
    mocks.markTokenRefreshError.mockResolvedValue(undefined)

    await integrationWhatsappService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mocks.markDegradedByIdentifier).not.toHaveBeenCalled()
    expect(mocks.markUnhealthyByIdentifier).not.toHaveBeenCalled()
  })
})
