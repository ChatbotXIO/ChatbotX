// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockMarkDegradedByIdentifier,
  mockMarkUnhealthyByIdentifier,
  mockUpdateReturning,
} = vi.hoisted(() => ({
  mockMarkDegradedByIdentifier: vi.fn(async () => null),
  mockMarkUnhealthyByIdentifier: vi.fn(async () => null),
  mockUpdateReturning: vi.fn(async () => [{ igId: "ig-1", type: "instagram" }]),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: mockUpdateReturning })),
      })),
    })),
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationInstagramModel: {
    id: "id",
    workspaceId: "workspaceId",
    igId: "igId",
    type: "type",
  },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    markDegradedByIdentifier: mockMarkDegradedByIdentifier,
    markUnhealthyByIdentifier: mockMarkUnhealthyByIdentifier,
  },
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it must happen after those mocks are registered.
const { instagramIntegrationService } = await import(
  "../src/integration-instagram/service"
)

describe("instagramIntegrationService.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ igId: "ig-1", type: "instagram" }])
  })

  test("degrades the Connection by igId as `instagram` on a transient refresh failure", async () => {
    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "instagram",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })

  test("resolves the `instagramFacebook` provider for a Facebook-login coexist row", async () => {
    mockUpdateReturning.mockResolvedValue([{ igId: "ig-1", type: "facebook" }])

    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "instagramFacebook",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
  })

  test("marks the Connection unhealthy when the provider confirms the token was revoked", async () => {
    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })

    expect(mockMarkUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "instagram",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "token_revoked",
    })
    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
  })

  test("no-ops the engine notification when the satellite row no longer exists", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })
})
