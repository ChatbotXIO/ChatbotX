import { type SQL, type SQLWrapper, sql } from "../client"

/** DMs and SMTP email threads are direct conversations; post threads are not. */
export const isDirectConversationSql = (sourceId: SQLWrapper): SQL =>
  sql`(${sourceId} IS NULL OR ${sourceId} LIKE 'email:%')`
