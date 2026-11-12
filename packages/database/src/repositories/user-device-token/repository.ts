import { type DatabaseClient, db, eq } from "../../client"
import { userDeviceTokenModel } from "../../schema"

const deleteByUserId = async (
  userId: string,
  tx: DatabaseClient = db,
): Promise<void> => {
  await tx
    .delete(userDeviceTokenModel)
    .where(eq(userDeviceTokenModel.userId, userId))
}

export const userDeviceTokenRepository = { deleteByUserId }
