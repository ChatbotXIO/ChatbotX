import { describe, expect, test } from "vitest"
import { isConversationUnread } from "../is-conversation-unread"

describe("isConversationUnread", () => {
  test("returns false when neither timestamp exists", () => {
    expect(
      isConversationUnread({ lastActivityAt: null, agentLastReadAt: null }),
    ).toBe(false)
  })

  test("returns true when activity exists but the agent has never read", () => {
    expect(
      isConversationUnread({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    ).toBe(true)
  })

  test("returns true when the last read is older than activity", () => {
    expect(
      isConversationUnread({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBe(true)
  })

  test("returns false when the last read equals activity", () => {
    const at = new Date("2026-01-02T00:00:00Z")
    expect(
      isConversationUnread({ lastActivityAt: at, agentLastReadAt: at }),
    ).toBe(false)
  })

  test("returns false when the last read is newer than activity", () => {
    expect(
      isConversationUnread({
        lastActivityAt: new Date("2026-01-01T00:00:00Z"),
        agentLastReadAt: new Date("2026-01-02T00:00:00Z"),
      }),
    ).toBe(false)
  })
})
