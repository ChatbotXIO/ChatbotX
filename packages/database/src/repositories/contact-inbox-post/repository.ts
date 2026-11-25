import { type DatabaseClient, db, sql } from "../../client"

const asBigintArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(ids, sql`, `)}]::bigint[]`

export const contactInboxPostRepository = {
  async insertIfParentExists(
    input: {
      commentedAt: Date
      contactInboxId: string
      inboxId: string
      postId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const result = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO "ContactInboxPost"
        ("workspaceId", "contactInboxId", "postId", "commentedAt")
      SELECT ${input.workspaceId}::bigint, ci."id", ${input.postId}::bigint, ${input.commentedAt}::timestamptz
      FROM "ContactInbox" ci
      JOIN "Inbox" i
        ON i."id" = ci."inboxId"
       AND i."workspaceId" = ${input.workspaceId}::bigint
      WHERE ci."id" = ${input.contactInboxId}::bigint
        AND ci."inboxId" = ${input.inboxId}::bigint
        AND EXISTS (
          SELECT 1
          FROM "ChannelPost" cp
          WHERE cp."id" = ${input.postId}::bigint
            AND cp."workspaceId" = ${input.workspaceId}::bigint
            AND cp."channel" = ci."channel"
        )
      FOR KEY SHARE OF ci
      ON CONFLICT ("workspaceId", "contactInboxId", "postId") DO NOTHING
      RETURNING "contactInboxId"
    `)

    return (result.rowCount ?? 0) > 0
  },

  /** When the contact inbox's first comment on the post was recorded, or null when none was. */
  async findCommentedAt(
    input: { contactInboxId: string; postId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<Date | null> {
    const result = await tx.execute<{ commentedAt: Date | string }>(sql`
      SELECT "commentedAt"
      FROM "ContactInboxPost"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "contactInboxId" = ${input.contactInboxId}::bigint
        AND "postId" = ${input.postId}::bigint
    `)

    const commentedAt = result.rows[0]?.commentedAt
    return commentedAt ? new Date(commentedAt) : null
  },

  async lockContactsForDelete(
    input: { contactIds: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string[]> {
    const contactIds = Array.from(new Set(input.contactIds))
    if (contactIds.length === 0) {
      return []
    }

    const result = await tx.execute<{ id: string }>(sql`
      SELECT "id"
      FROM "Contact"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "id" = ANY(${asBigintArray(contactIds)})
      ORDER BY "id"
      FOR UPDATE
    `)

    return result.rows.map((row) => row.id)
  },

  async lockContactInboxIdsByContactIds(
    input: { contactIds: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string[]> {
    const contactIds = Array.from(new Set(input.contactIds))
    if (contactIds.length === 0) {
      return []
    }

    const result = await tx.execute<{ id: string }>(sql`
      SELECT ci."id"
      FROM "ContactInbox" ci
      JOIN "Contact" c ON c."id" = ci."contactId"
      WHERE c."workspaceId" = ${input.workspaceId}::bigint
        AND c."id" = ANY(${asBigintArray(contactIds)})
      ORDER BY ci."id"
      FOR UPDATE OF ci
    `)

    return result.rows.map((row) => row.id)
  },

  async deleteByContactInboxIds(
    input: { contactInboxIds: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    const contactInboxIds = Array.from(new Set(input.contactInboxIds))
    if (contactInboxIds.length === 0) {
      return 0
    }

    const result = await tx.execute<Record<string, unknown>>(sql`
      DELETE FROM "ContactInboxPost"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "contactInboxId" = ANY(${asBigintArray(contactInboxIds)})
    `)

    return result.rowCount ?? 0
  },

  async deleteWorkspaceBatch(input: {
    limit: number
    workspaceId: string
  }): Promise<number> {
    const result = await db.execute<Record<string, unknown>>(sql`
      DELETE FROM "ContactInboxPost"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND ("workspaceId", "contactInboxId", "postId") IN (
          SELECT "workspaceId", "contactInboxId", "postId"
          FROM "ContactInboxPost"
          WHERE "workspaceId" = ${input.workspaceId}::bigint
          ORDER BY "contactInboxId", "postId"
          LIMIT ${input.limit}
        )
    `)

    return result.rowCount ?? 0
  },

  async hasWorkspaceRows(input: { workspaceId: string }): Promise<boolean> {
    const result = await db.execute<Record<string, unknown>>(sql`
      SELECT 1
      FROM "ContactInboxPost"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
      LIMIT 1
    `)

    return result.rows.length > 0
  },
}
