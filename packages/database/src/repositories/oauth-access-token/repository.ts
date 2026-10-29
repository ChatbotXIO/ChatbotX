import { and, eq, lt } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
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

  async listActiveByUser(
    userId: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<(OAuthAccessTokenModel & { client: OAuthApplicationModel })[]> {
    const rows = await tx.query.oauthAccessTokenModel.findMany({
      where: {
        userId,
        refreshTokenExpiresAt: { gt: now },
      },
      with: { client: true },
      orderBy: { createdAt: "desc" },
    })

    return rows.filter(
      (row): row is OAuthAccessTokenModel & { client: OAuthApplicationModel } =>
        row.client !== null,
    )
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
