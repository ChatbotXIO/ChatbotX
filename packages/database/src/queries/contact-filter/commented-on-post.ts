import { sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import { contactInboxModel, contactInboxPostModel } from "../../schema"
import { existsWhere } from "./exists"
import type { ContactWhere } from "./types"

const POST_ID_PATTERN = /^(?:0|[1-9]\d*)$/
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n

const parsePostIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return
  }
  const ids = [...new Set(value)]
  return ids.every(
    (id) =>
      typeof id === "string" &&
      POST_ID_PATTERN.test(id) &&
      BigInt(id) > 0n &&
      BigInt(id) <= MAX_SIGNED_BIGINT,
  )
    ? ids
    : undefined
}

export const buildCommentedOnPostWhere = (
  operator: string,
  value: unknown,
  workspaceId: string | undefined,
): ContactWhere => {
  if (!workspaceId) {
    return {}
  }
  const anyComment = (contactId: unknown) => sql`SELECT 1
    FROM ${contactInboxModel} ci
    JOIN ${contactInboxPostModel} p
      ON p."workspaceId" = ${workspaceId}::bigint AND p."contactInboxId" = ci.id
    WHERE ci."contactId" = ${contactId}`

  if (operator === operatorTypes.enum.isEmpty) {
    return existsWhere((contactId) => anyComment(contactId), true)
  }
  if (
    !(operator === operatorTypes.enum.eq || operator === operatorTypes.enum.ne)
  ) {
    return {}
  }
  const ids = parsePostIds(value)
  if (!ids) {
    return {}
  }
  return existsWhere(
    (contactId) => sql`${anyComment(contactId)}
      AND p."postId" = ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}::bigint`),
        sql`, `,
      )}]::bigint[])`,
    operator === operatorTypes.enum.ne,
  )
}
