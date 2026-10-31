import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  isNull,
  sql,
} from "../../client"
import {
  oauthClientModel,
  oauthConsentModel,
  oauthRefreshTokenModel,
} from "../../schema"

class OAuthConsentRepository {
  async listGivenByUser(userId: string, now: Date, tx: DatabaseClient = db) {
    const activeTokens = tx
      .select({
        activeUntil: sql<Date | null>`max(${oauthRefreshTokenModel.expiresAt})`
          .mapWith((value: string | Date | null) =>
            value ? new Date(value) : null,
          )
          .as("activeUntil"),
        clientId: oauthRefreshTokenModel.clientId,
        lastRefreshedAt:
          sql<Date | null>`max(${oauthRefreshTokenModel.createdAt})`
            .mapWith((value: string | Date | null) =>
              value ? new Date(value) : null,
            )
            .as("lastRefreshedAt"),
      })
      .from(oauthRefreshTokenModel)
      .where(
        and(
          eq(oauthRefreshTokenModel.userId, userId),
          gt(oauthRefreshTokenModel.expiresAt, now),
          isNull(oauthRefreshTokenModel.revoked),
        ),
      )
      .groupBy(oauthRefreshTokenModel.clientId)
      .as("activeTokens")

    return await tx
      .select({
        activeUntil: activeTokens.activeUntil,
        clientIcon: oauthClientModel.icon,
        clientId: oauthConsentModel.clientId,
        clientName: oauthClientModel.name,
        firstAuthorizedAt: oauthConsentModel.createdAt,
        lastRefreshedAt: activeTokens.lastRefreshedAt,
        scopes: oauthConsentModel.scopes,
      })
      .from(oauthConsentModel)
      .innerJoin(
        oauthClientModel,
        eq(oauthConsentModel.clientId, oauthClientModel.clientId),
      )
      .leftJoin(
        activeTokens,
        eq(oauthConsentModel.clientId, activeTokens.clientId),
      )
      .where(eq(oauthConsentModel.userId, userId))
      .orderBy(desc(oauthConsentModel.createdAt))
  }

  async findLatestGivenByUserAndClient(
    input: { userId: string; clientId: string },
    tx: DatabaseClient = db,
  ): Promise<{ workspaceId: string | null } | null> {
    const [row] = await tx
      .select({ workspaceId: oauthConsentModel.workspaceId })
      .from(oauthConsentModel)
      .where(
        and(
          eq(oauthConsentModel.userId, input.userId),
          eq(oauthConsentModel.clientId, input.clientId),
        ),
      )
      .orderBy(
        sql`${oauthConsentModel.workspaceId} IS NULL`,
        desc(oauthConsentModel.createdAt),
        desc(oauthConsentModel.id),
      )
      .limit(1)

    return row ?? null
  }

  async setWorkspaceByUserAndClient(
    input: { userId: string; clientId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(oauthConsentModel)
      .set({ workspaceId: input.workspaceId })
      .where(
        and(
          eq(oauthConsentModel.userId, input.userId),
          eq(oauthConsentModel.clientId, input.clientId),
        ),
      )
      .returning({ id: oauthConsentModel.id })

    return rows.length
  }

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
