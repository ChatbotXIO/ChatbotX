import { and, type DatabaseClient, db, eq, lt } from "../../client"
import { oauthAccessTokenModel } from "../../schema"

class OAuthAccessTokenRepository {
  async deleteByUserAndClient(
    input: { userId: string; clientId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .delete(oauthAccessTokenModel)
      .where(
        and(
          eq(oauthAccessTokenModel.userId, input.userId),
          eq(oauthAccessTokenModel.clientId, input.clientId),
        ),
      )
      .returning({ id: oauthAccessTokenModel.id })

    return rows.length
  }

  async deleteExpired(now: Date, tx: DatabaseClient = db): Promise<number> {
    const rows = await tx
      .delete(oauthAccessTokenModel)
      .where(lt(oauthAccessTokenModel.expiresAt, now))
      .returning({ id: oauthAccessTokenModel.id })

    return rows.length
  }
}

export const oauthAccessTokenRepository = new OAuthAccessTokenRepository()
