import { type DatabaseClient, db, eq } from "../../client"
import { verificationModel } from "../../schema"

class VerificationRepository {
  async findByIdentifier(
    identifier: string,
    tx: DatabaseClient = db,
  ): Promise<{ expiresAt: Date; value: string } | null> {
    const [row] = await tx
      .select({
        expiresAt: verificationModel.expiresAt,
        value: verificationModel.value,
      })
      .from(verificationModel)
      .where(eq(verificationModel.identifier, identifier))
      .limit(1)

    return row ?? null
  }
}

export const verificationRepository = new VerificationRepository()
