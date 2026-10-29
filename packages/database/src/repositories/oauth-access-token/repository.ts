import { and, type DatabaseClient, db, eq, lt } from "../../client"
import { oauthAccessTokenModel } from "../../schema"
import type { OAuthAccessTokenModel, OAuthApplicationModel } from "../../types"

class OAuthAccessTokenRepository {
  async findByAccessToken(
    accessToken: string,
    tx: DatabaseClient = db,
  ): Promise<
    (OAuthAccessTokenModel & { client: OAuthApplicationModel }) | null
  > {
    const row = await tx.query.oauthAccessTokenModel.findFirst({
      where: { accessToken },
      with: { client: true },
    })
    if (!row?.client) {
      return null
    }

    return row as OAuthAccessTokenModel & { client: OAuthApplicationModel }
  }

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
      .where(lt(oauthAccessTokenModel.refreshTokenExpiresAt, now))
      .returning({ id: oauthAccessTokenModel.id })

    return rows.length
  }
}

export const oauthAccessTokenRepository = new OAuthAccessTokenRepository()
