// @vitest-environment node

import { db } from "@chatbotx.io/database/client"
import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listFollowingCurrencyIds: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/repositories")>()
  return {
    ...actual,
    pipelineRepository: {
      ...actual.pipelineRepository,
      listFollowingCurrencyIds: mocks.listFollowingCurrencyIds,
    },
  }
})
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { listUserIdsByWorkspaceId: async () => [] },
  workspaceMemberCacheTag: (userId: string) => `users:${userId}:members`,
  workspaceRosterCacheTag: (workspaceId: string) => `ws:${workspaceId}:roster`,
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

/**
 * `currency-refresh` sits on the `workspace/service` import cycle that already
 * exists through the realtime publisher. Nothing may be dereferenced while the
 * modules evaluate, so entering the cycle from the workspace service first and
 * then calling through it must reach the real refresh. (The resolver's own
 * entry order is pipeline-currency-import-order.)
 */
describe("currency-refresh import order", () => {
  test("a target country change entered through the workspace service reaches the real refresh", async () => {
    const { workspaceService } = await import("../src/workspace/service")
    vi.spyOn(db, "update").mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "ws-1", targetCountry: "VN" }],
        }),
      }),
    } as never)
    mocks.listFollowingCurrencyIds.mockResolvedValue([])

    await workspaceService.updateSettings({
      id: "ws-1",
      data: { targetCountry: "VN" },
    })

    expect(mocks.listFollowingCurrencyIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      afterId: null,
      limit: 200,
    })
  })
})
