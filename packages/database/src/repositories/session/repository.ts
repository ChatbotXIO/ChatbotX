import { type DatabaseClient, db, eq } from "../../client"
import { sessionModel } from "../../schema"

const deleteByUserId = async (
  userId: string,
  tx: DatabaseClient = db,
): Promise<void> => {
  await tx.delete(sessionModel).where(eq(sessionModel.userId, userId))
}

export const sessionRepository = { deleteByUserId }
