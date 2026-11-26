import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  blocked: { value: false },
  refresh: vi.fn(async () => "stored"),
}))

vi.mock("@chatbotx.io/business", () => ({
  publishDestinationAvatarService: { refresh: mocks.refresh },
  withBlockedOwnerGuard: async (
    _workspaceId: string,
    run: () => Promise<void>,
  ) => {
    if (!mocks.blocked.value) {
      await run()
    }
  },
}))
vi.mock("@chatbotx.io/channel-registry/publish-avatar-ops", () => ({
  createPublishAvatarOps: () => ({ fetchPictureUrl: vi.fn() }),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

import { refreshPublishDestinationAvatar } from "../src/publish-destination/refresh-avatar"

describe("refreshPublishDestinationAvatar", () => {
  test("hands the ids to the service with the channel ops", async () => {
    await refreshPublishDestinationAvatar({
      publishDestinationId: "d1",
      workspaceId: "w1",
    })

    expect(mocks.refresh).toHaveBeenCalledWith(
      { publishDestinationId: "d1", workspaceId: "w1" },
      expect.objectContaining({ fetchPictureUrl: expect.any(Function) }),
    )
  })

  test("does nothing for a blocked workspace owner", async () => {
    mocks.refresh.mockClear()
    mocks.blocked.value = true

    await refreshPublishDestinationAvatar({
      publishDestinationId: "d1",
      workspaceId: "w1",
    })
    mocks.blocked.value = false

    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
