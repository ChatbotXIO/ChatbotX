import { beforeEach, describe, expect, test, vi } from "vitest"

const { findByWorkspaceId, subscribePageToInstagramWebhook } = vi.hoisted(
  () => ({
    findByWorkspaceId: vi.fn(),
    subscribePageToInstagramWebhook: vi.fn(),
  }),
)

vi.mock("server-only", () => ({}))
vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: { findByWorkspaceId },
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  subscribePageToInstagramWebhook,
}))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))

import { ensureLiveCommentsSubscriptionForAutomation } from "@/features/ig-comments/lib/ensure-live-comments-subscription"

const LIVE = { type: "live" as const, value: [] }

beforeEach(() => {
  vi.clearAllMocks()
  findByWorkspaceId.mockResolvedValue([
    {
      id: "integration-1",
      igId: "ig-1",
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { version: "v23.0" },
      },
    },
  ])
  subscribePageToInstagramWebhook.mockResolvedValue(undefined)
})

describe("ensureLiveCommentsSubscriptionForAutomation", () => {
  test("re-subscribes every Instagram Login account for a Live automation", async () => {
    await ensureLiveCommentsSubscriptionForAutomation({
      workspaceId: "workspace-1",
      type: "instagram",
      post: LIVE,
    })

    expect(findByWorkspaceId).toHaveBeenCalledWith("workspace-1", "instagram")
    expect(subscribePageToInstagramWebhook).toHaveBeenCalledWith({
      igId: "ig-1",
      accessToken: "token-1",
      version: "v23.0",
    })
  })

  test("does nothing for a post automation or for Instagram via Facebook", async () => {
    await ensureLiveCommentsSubscriptionForAutomation({
      workspaceId: "workspace-1",
      type: "instagram",
      post: { type: "all", value: [] },
    })
    await ensureLiveCommentsSubscriptionForAutomation({
      workspaceId: "workspace-1",
      type: "instagramFacebook",
      post: LIVE,
    })

    expect(subscribePageToInstagramWebhook).not.toHaveBeenCalled()
  })

  test("a failed re-subscribe never fails the save", async () => {
    subscribePageToInstagramWebhook.mockRejectedValue(new Error("graph down"))

    await expect(
      ensureLiveCommentsSubscriptionForAutomation({
        workspaceId: "workspace-1",
        type: "instagram",
        post: LIVE,
      }),
    ).resolves.toBeUndefined()
  })
})
