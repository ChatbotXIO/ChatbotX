// @vitest-environment jsdom
import { channelPostShareRefusalReasons } from "@chatbotx.io/utils/channel-post"
import { describe, expect, test, vi } from "vitest"
import en from "../messages/en.json"

vi.mock("@/features/shared/comment-automation/post-picker", () => ({
  PostGrid: () => null,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/query", () => ({ orpc: {} }))

const { getChannelPostRefusal } = await import(
  "@/features/messages/lib/channel-post-refusal"
)
const { refusalReasonKey } = await import(
  "@/features/channel-posts/components/share-post-picker"
)

describe("getChannelPostRefusal", () => {
  test("reads the typed reason of a refused send", () => {
    expect(
      getChannelPostRefusal({
        channelPostRefused: { reason: "channelPostNotFound" },
      }),
    ).toEqual({ reason: "channelPostNotFound" })
  })

  test("ignores a normal send result and an unknown reason", () => {
    expect(getChannelPostRefusal({ id: "m1" })).toBeUndefined()
    expect(getChannelPostRefusal(undefined)).toBeUndefined()
    expect(
      getChannelPostRefusal({ channelPostRefused: { reason: "boom" } }),
    ).toBeUndefined()
  })
})

describe("refusalReasonKey", () => {
  test("every refusal reason has a translation", () => {
    for (const reason of channelPostShareRefusalReasons) {
      const key = refusalReasonKey[reason].split(".").at(-1) ?? ""
      expect(
        Object.keys(en.flows.sendChannelPost.reasons),
        `${reason} -> ${key}`,
      ).toContain(key)
    }
  })
})
