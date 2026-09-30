import { type DatabaseClient, db, sql } from "../../client"

const asBigintArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(ids, sql`, `)}]::bigint[]`

export const contactInboxPostRepository = {
  async lockWorkspaceForPostWrite(
    input: { workspaceId: string },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const result = await tx.execute<{ purgeStartedAt: Date | null }>(sql`
      SELECT "purgeStartedAt"
      FROM "Workspace"
      WHERE "id" = ${input.workspaceId}::bigint
      FOR KEY SHARE
    `)

    return result.rows[0]?.purgeStartedAt === null
  },

  async insertIfParentExists(
    input: {
      channel: "instagram" | "messenger"
      commentedAt: Date
      contactInboxId: string
      inboxId: string
      postId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      INSERT INTO "ContactInboxPost"
        ("workspaceId", "contactInboxId", "postId", "commentedAt")
      SELECT ${input.workspaceId}::bigint, ci."id", ${input.postId}::bigint, ${input.commentedAt}::timestamptz
      FROM "ContactInbox" ci
      JOIN "Inbox" i
        ON i."id" = ci."inboxId"
       AND i."workspaceId" = ${input.workspaceId}::bigint
      WHERE ci."id" = ${input.contactInboxId}::bigint
        AND ci."inboxId" = ${input.inboxId}::bigint
        AND ci."channel" = ${input.channel}
        AND EXISTS (
          SELECT 1
          FROM "ChannelPost" cp
          WHERE cp."id" = ${input.postId}::bigint
            AND cp."workspaceId" = ${input.workspaceId}::bigint
        )
      FOR KEY SHARE OF ci
      ON CONFLICT ("workspaceId", "contactInboxId", "postId") DO NOTHING
      RETURNING "contactInboxId"
    `)

    return (result.rowCount ?? 0) > 0
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

    const result = await tx.execute(sql`
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
    const result = await db.execute(sql`
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
    const result = await db.execute(sql`
      SELECT 1
      FROM "ContactInboxPost"
      WHERE "workspaceId" = ${input.workspaceId}::bigint
      LIMIT 1
    `)

    return result.rows.length > 0
  },
}
