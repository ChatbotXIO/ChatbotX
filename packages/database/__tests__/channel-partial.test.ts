import { describe, expect, test } from "vitest"
import { resolveChannelConversationId } from "../src/partials/channel"

describe("resolveChannelConversationId", () => {
  test("reads the id from additionalAttributes", () => {
    expect(
      resolveChannelConversationId({
        sourceId: null,
        additionalAttributes: { channelConversationId: "conv-1" },
      }),
    ).toBe("conv-1")
  })

  test("prefers additionalAttributes over a legacy sourceId", () => {
    expect(
      resolveChannelConversationId({
        sourceId: "legacy-conv",
        additionalAttributes: { channelConversationId: "conv-1" },
      }),
    ).toBe("conv-1")
  })

  test("falls back to sourceId for rows the backfill has not reached", () => {
    expect(
      resolveChannelConversationId({
        sourceId: "legacy-conv",
        additionalAttributes: null,
      }),
    ).toBe("legacy-conv")
  })

  test("ignores a non-string or empty stored value", () => {
    expect(
      resolveChannelConversationId({
        sourceId: "legacy-conv",
        additionalAttributes: { channelConversationId: 42 },
      }),
    ).toBe("legacy-conv")
    expect(
      resolveChannelConversationId({
        sourceId: "legacy-conv",
        additionalAttributes: { channelConversationId: "" },
      }),
    ).toBe("legacy-conv")
  })

  test("returns null for a DM conversation that carries neither", () => {
    expect(
      resolveChannelConversationId({
        sourceId: null,
        additionalAttributes: {},
      }),
    ).toBeNull()
  })
})
