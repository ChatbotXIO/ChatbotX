import { sql } from "drizzle-orm"

/**
 * Relational-query form of the canonical raw-SQL unread predicate in
 * `packages/database/src/queries/contact-filter/index.ts` (around line 666).
 * Keep both representations in sync when the unread definition changes.
 */
export const conversationUnreadWhere = {
  OR: [
    {
      agentLastReadAt: { isNull: true },
      lastActivityAt: { isNotNull: true },
    },
    { lastActivityAt: { gt: sql`"agentLastReadAt"` } },
  ],
} satisfies Record<string, unknown>
