// @vitest-environment node

import { describe, expect, test } from "vitest"
import { buildConversationWhere } from "@/features/conversations/queries/build-conversation-where"

describe("buildConversationWhere — keyset cursor", () => {
  test("tie-breaker compares lastActivityAt with an explicit eq operator", () => {
    // Drizzle's relational filter treats a bare Date as an (empty) operator
    // object and drops it, which collapsed the tie-breaker to `id < cursor.id`
    // and made later pages repeat newer conversations — the inbox stopped
    // loading once a whole page came back as duplicates.
    const lastActivityAt = new Date("2026-11-08T04:19:40.433Z")
    const where = buildConversationWhere(
      "ws-1",
      {},
      { lastActivityAt, id: "100" },
    )

    expect(where.OR).toEqual([
      { lastActivityAt: { lt: lastActivityAt } },
      { lastActivityAt: { isNull: true } },
      { lastActivityAt: { eq: lastActivityAt }, id: { lt: "100" } },
    ])
  })

  test("null-activity cursor only pages through null-activity rows", () => {
    const where = buildConversationWhere(
      "ws-1",
      {},
      { lastActivityAt: null, id: "100" },
    )

    expect(where.OR).toEqual([
      { lastActivityAt: { isNull: true }, id: { lt: "100" } },
    ])
  })
})
