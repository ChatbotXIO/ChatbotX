import { and, type DatabaseClient, db, eq } from "../../client"
import { oauthConsentModel } from "../../schema"

class OAuthConsentRepository {
  async deleteByUserAndClient(
    input: { userId: string; clientId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .delete(oauthConsentModel)
      .where(
        and(
          eq(oauthConsentModel.userId, input.userId),
          eq(oauthConsentModel.clientId, input.clientId),
        ),
      )
      .returning({ id: oauthConsentModel.id })

    return rows.length
  }
}

export const oauthConsentRepository = new OAuthConsentRepository()
