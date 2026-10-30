import { and, type DatabaseClient, db, desc, eq, gt, sql } from "../../client"
import {
  oauthAccessTokenModel,
  oauthApplicationModel,
  oauthConsentModel,
} from "../../schema"

class OAuthConsentRepository {
  async listGivenByUser(userId: string, now: Date, tx: DatabaseClient = db) {
    const activeTokens = tx
      .select({
        activeTokenCount: sql<number>`count(*)`.as("activeTokenCount"),
        activeUntil:
          sql<Date | null>`max(${oauthAccessTokenModel.refreshTokenExpiresAt})`
            .mapWith((value: string | Date | null) =>
              value ? new Date(value) : null,
            )
            .as("activeUntil"),
        clientId: oauthAccessTokenModel.clientId,
        lastRefreshedAt:
          sql<Date | null>`max(${oauthAccessTokenModel.createdAt})`
            .mapWith((value: string | Date | null) =>
              value ? new Date(value) : null,
            )
            .as("lastRefreshedAt"),
      })
      .from(oauthAccessTokenModel)
      .where(
        and(
          eq(oauthAccessTokenModel.userId, userId),
          gt(oauthAccessTokenModel.refreshTokenExpiresAt, now),
        ),
      )
      .groupBy(oauthAccessTokenModel.clientId)
      .as("activeTokens")

    return await tx
      .select({
        activeTokenCount: activeTokens.activeTokenCount,
        activeUntil: activeTokens.activeUntil,
        clientIcon: oauthApplicationModel.icon,
        clientId: oauthConsentModel.clientId,
        clientName: oauthApplicationModel.name,
        firstAuthorizedAt: oauthConsentModel.createdAt,
        lastRefreshedAt: activeTokens.lastRefreshedAt,
        scopes: oauthConsentModel.scopes,
      })
      .from(oauthConsentModel)
      .innerJoin(
        oauthApplicationModel,
        eq(oauthConsentModel.clientId, oauthApplicationModel.clientId),
      )
      .leftJoin(
        activeTokens,
        eq(oauthConsentModel.clientId, activeTokens.clientId),
      )
      .where(
        and(
          eq(oauthConsentModel.userId, userId),
          eq(oauthConsentModel.consentGiven, true),
        ),
      )
      .orderBy(desc(oauthConsentModel.createdAt))
  }

  /**
   * The latest workspace-bound consent the user gave this client, falling back
   * to the most recent legacy unbound consent when no bound consent exists.
   * Returns null when they never approved it or the consent was revoked or
   * cascaded away with its workspace.
   */
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
          eq(oauthConsentModel.consentGiven, true),
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
          eq(oauthConsentModel.consentGiven, true),
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
