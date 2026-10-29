import { type DatabaseClient, db } from "../../client"
import type { OAuthAccessTokenModel } from "../../types"

class OAuthAccessTokenRepository {
  async findByAccessToken(
    accessToken: string,
    tx: DatabaseClient = db,
  ): Promise<OAuthAccessTokenModel | null> {
    const row = await tx.query.oauthAccessTokenModel.findFirst({
      where: { accessToken },
    })

    return row ?? null
  }
}

export const oauthAccessTokenRepository = new OAuthAccessTokenRepository()
