import { describe, expect, test, vi } from "vitest"
import { buildDestinationAvatarUrls } from "../avatar-url"

const mocks = vi.hoisted(() => ({ sign: vi.fn() }))

vi.mock("@chatbotx.io/encryption", () => ({ signMediaToken: mocks.sign }))
vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: async () => "https://bot.example.com",
}))

describe("buildDestinationAvatarUrls", () => {
  test("signs a destinationAvatar token per destination on the workspace origin", async () => {
    mocks.sign.mockImplementation(
      async (claims: { refId: string }) => `tok-${claims.refId}`,
    )

    const urls = await buildDestinationAvatarUrls({
      publishDestinationIds: ["d1", "d2"],
      workspaceId: "w1",
    })

    expect(urls.get("d1")).toBe(
      "https://bot.example.com/media/destination-avatar/tok-d1",
    )
    expect(mocks.sign).toHaveBeenCalledWith({
      kind: "destinationAvatar",
      refId: "d2",
      workspaceId: "w1",
    })
  })

  test("signs nothing for an empty list", async () => {
    mocks.sign.mockClear()
    const urls = await buildDestinationAvatarUrls({
      publishDestinationIds: [],
      workspaceId: "w1",
    })
    expect(urls.size).toBe(0)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})
