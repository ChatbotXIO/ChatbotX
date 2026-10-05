// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockMarkDegradedByIdentifier,
  mockMarkUnhealthyByIdentifier,
  mockUpdateReturning,
} = vi.hoisted(() => ({
  mockMarkDegradedByIdentifier: vi.fn(async () => null),
  mockMarkUnhealthyByIdentifier: vi.fn(async () => null),
  mockUpdateReturning: vi.fn(async () => [{ pageId: "page-1" }]),
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
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMessengerModel: {
    id: "id",
    workspaceId: "workspaceId",
    pageId: "pageId",
  },
  tagChannelModel: {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {},
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    markDegradedByIdentifier: mockMarkDegradedByIdentifier,
    markUnhealthyByIdentifier: mockMarkUnhealthyByIdentifier,
  },
}))

vi.mock("../src/flow/service", () => ({
  flowService: {},
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {},
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it must happen after those mocks are registered.
const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)

describe("messengerIntegrationService.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ pageId: "page-1" }])
  })

  test("degrades the Connection by pageId on a transient refresh failure", async () => {
    await messengerIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "messenger",
      identifier: "page-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })

  test("marks the Connection unhealthy when the provider confirms the token was revoked", async () => {
    await messengerIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })

    expect(mockMarkUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "messenger",
      identifier: "page-1",
      workspaceId: "ws-1",
      reason: "token_revoked",
    })
    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
  })

  test("no-ops the engine notification when the satellite row no longer exists", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await messengerIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })
})
