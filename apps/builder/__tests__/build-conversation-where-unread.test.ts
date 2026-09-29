// @vitest-environment node

import { conversationUnreadWhere } from "@chatbotx.io/database/queries"
import { describe, expect, test } from "vitest"
import { buildConversationWhere } from "@/features/conversations/queries/build-conversation-where"

describe("buildConversationWhere — unread tag", () => {
  test("filters on the shared lastActivityAt > agentLastReadAt predicate", () => {
    const where = buildConversationWhere("ws-1", { tags: ["unread"] }, null)

    expect(where.AND).toEqual([conversationUnreadWhere])
  })

  test("composes with noAdminReply without overwriting its contactRepliedAt bound", () => {
    const where = buildConversationWhere(
      "ws-1",
      { tags: ["unread", "noAdminReply"] },
      null,
    )

    expect(where.contactRepliedAt).toEqual({ gt: expect.anything() })
    expect(where.AND).toEqual([conversationUnreadWhere])
  })

  test("no unread tag adds no AND clause", () => {
    const where = buildConversationWhere("ws-1", { tags: [] }, null)

    expect(where.AND).toBeUndefined()
  })
})
