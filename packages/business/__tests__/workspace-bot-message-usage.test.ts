import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getForUser: vi.fn(),
  increment: vi.fn(),
}))

vi.mock(
  "@chatbotx.io/database/repositories/workspace-bot-message-usage",
  () => ({
    workspaceBotMessageUsageRepository: { increment: mocks.increment },
  }),
)

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: { getForUser: mocks.getForUser },
}))

const { workspaceBotMessageUsageService } = await import(
  "../src/workspace-bot-message-usage/service"
)

describe("WorkspaceBotMessageUsageService.increment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getForUser.mockResolvedValue({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
    })
    mocks.increment.mockResolvedValue(undefined)
  })

  test("uses the worker-resolved workspace ownership without querying workspace again", async () => {
    await workspaceBotMessageUsageService.increment({
      count: 3,
      ownerId: "owner-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
    })

    expect(mocks.getForUser).toHaveBeenCalledWith("owner-1")
    expect(mocks.increment).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 3,
        ownerId: "owner-1",
        periodEnd: expect.any(Date),
        periodStart: expect.any(Date),
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
      }),
    )
  })
})
