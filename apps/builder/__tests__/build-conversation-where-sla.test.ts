// @vitest-environment node

import { conversationUnreadWhere } from "@chatbotx.io/database/queries"
import { describe, expect, test } from "vitest"
import { buildConversationWhere } from "@/features/conversations/queries/build-conversation-where"

describe("buildConversationWhere — response SLA tags", () => {
  test("slaBreached = deadline already passed", () => {
    const before = Date.now()
    const where = buildConversationWhere(
      "ws-1",
      { tags: ["slaBreached"] },
      null,
    )

    expect(where.AND).toEqual([{ responseDueAt: { lte: expect.any(Date) } }])
    const bound = (where.AND as { responseDueAt: { lte: Date } }[])[0]
      .responseDueAt.lte
    expect(bound.getTime()).toBeGreaterThanOrEqual(before)
  })

  test("slaBreaching = past the breaching instant but not yet due", () => {
    const where = buildConversationWhere(
      "ws-1",
      { tags: ["slaBreaching"] },
      null,
    )

    expect(where.AND).toEqual([
      { responseSlaBreachingAt: { lte: expect.any(Date) } },
      { responseDueAt: { gt: expect.any(Date) } },
    ])
  })

  test("both bounds use the same instant so the two states never overlap", () => {
    const where = buildConversationWhere(
      "ws-1",
      { tags: ["slaBreaching"] },
      null,
    )
    const [breaching, due] = where.AND as [
      { responseSlaBreachingAt: { lte: Date } },
      { responseDueAt: { gt: Date } },
    ]

    expect(breaching.responseSlaBreachingAt.lte.getTime()).toBe(
      due.responseDueAt.gt.getTime(),
    )
  })

  test("composes with the unread predicate instead of replacing it", () => {
    const where = buildConversationWhere(
      "ws-1",
      { tags: ["unread", "slaBreached"] },
      null,
    )

    expect(where.AND).toEqual([
      conversationUnreadWhere,
      { responseDueAt: { lte: expect.any(Date) } },
    ])
  })

  test("no SLA tag adds no SLA clause", () => {
    const where = buildConversationWhere("ws-1", { tags: ["followUp"] }, null)

    expect(where.AND).toBeUndefined()
  })
})
