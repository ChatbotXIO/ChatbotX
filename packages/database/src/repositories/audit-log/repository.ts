import { type DatabaseClient, db, sql } from "../../client"

const detachUserBatch = async (
  userId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const result = await tx.execute<{ id: string }>(sql`
    WITH batch AS (
      SELECT "id"
      FROM "AuditLog"
      WHERE "userId" = ${userId}
      ORDER BY "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "AuditLog"
    SET "userId" = NULL
    FROM batch
    WHERE "AuditLog"."id" = batch."id"
    RETURNING "AuditLog"."id"
  `)

  return result.rows.length
}

export const auditLogRepository = { detachUserBatch }
