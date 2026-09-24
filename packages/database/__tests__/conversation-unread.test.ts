import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { conversationUnreadWhere } from "../src/queries/conversation-unread"

describe("conversationUnreadWhere", () => {
  test("matches the canonical unread semantics for never-read and newer-activity conversations", () => {
    expect(conversationUnreadWhere.OR[0]).toEqual({
      agentLastReadAt: { isNull: true },
      lastActivityAt: { isNotNull: true },
    })
    expect(conversationUnreadWhere.OR[1].lastActivityAt).toHaveProperty("gt")

    const query = new PgDialect().sqlToQuery(
      conversationUnreadWhere.OR[1].lastActivityAt.gt,
    )
    expect(query.sql).toBe('"agentLastReadAt"')
    expect(query.params).toEqual([])
  })
})
