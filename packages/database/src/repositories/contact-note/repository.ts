import { type DatabaseClient, db, sql } from "../../client"

const detachAuthorBatch = async (
  userId: string,
  limit: number,
  tx: DatabaseClient = db,
): Promise<number> => {
  const result = await tx.execute<{ id: string }>(sql`
    WITH batch AS (
      SELECT "id"
      FROM "ContactNote"
      WHERE "createdById" = ${userId}
      ORDER BY "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "ContactNote"
    SET "createdById" = NULL
    FROM batch
    WHERE "ContactNote"."id" = batch."id"
    RETURNING "ContactNote"."id"
  `)

  return result.rows.length
}

export const contactNoteRepository = { detachAuthorBatch }
