import { and, type DatabaseClient, db, eq, lt } from "../../client"
import { oauthRefreshTokenModel } from "../../schema"

class OAuthRefreshTokenRepository {
  async deleteByUserAndClient(
    input: { userId: string; clientId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .delete(oauthRefreshTokenModel)
      .where(
        and(
          eq(oauthRefreshTokenModel.userId, input.userId),
          eq(oauthRefreshTokenModel.clientId, input.clientId),
        ),
      )
      .returning({ id: oauthRefreshTokenModel.id })

    return rows.length
  }

  async deleteExpired(now: Date, tx: DatabaseClient = db): Promise<number> {
    const rows = await tx
      .delete(oauthRefreshTokenModel)
      .where(lt(oauthRefreshTokenModel.expiresAt, now))
      .returning({ id: oauthRefreshTokenModel.id })

    return rows.length
  }
}

export const oauthRefreshTokenRepository = new OAuthRefreshTokenRepository()
