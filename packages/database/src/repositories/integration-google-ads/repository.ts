import { and, asc, type DatabaseClient, db, eq, gt } from "../../client"
import { integrationGoogleAdsModel } from "../../schema"
import type { IntegrationGoogleAdsModel } from "../../types"

export type GoogleAdsSetupValues = Partial<
  Pick<
    typeof integrationGoogleAdsModel.$inferInsert,
    | "conversionCustomerId"
    | "acceptedCustomerDataTerms"
    | "conversionActions"
    | "conversionActionsSyncedAt"
    | "setupError"
    | "setupErrorAt"
  >
>

export const integrationGoogleAdsRepository = {
  async findByWorkspaceId(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationGoogleAdsModel | null> {
    const [row] = await tx
      .select()
      .from(integrationGoogleAdsModel)
      .where(eq(integrationGoogleAdsModel.workspaceId, input.workspaceId))
      .limit(1)

    return row ?? null
  },

  async updateSetup(
    input: { id: string; workspaceId: string; values: GoogleAdsSetupValues },
    tx: DatabaseClient = db,
  ): Promise<IntegrationGoogleAdsModel | null> {
    const [row] = await tx
      .update(integrationGoogleAdsModel)
      .set(input.values)
      .where(
        and(
          eq(integrationGoogleAdsModel.id, input.id),
          eq(integrationGoogleAdsModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()

    return row ?? null
  },

  /** Keyset page of every Google Ads account, for the daily setup sync. */
  async listSyncTargets(
    input: { afterId?: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<Pick<IntegrationGoogleAdsModel, "id" | "workspaceId">[]> {
    return await tx
      .select({
        id: integrationGoogleAdsModel.id,
        workspaceId: integrationGoogleAdsModel.workspaceId,
      })
      .from(integrationGoogleAdsModel)
      .where(
        input.afterId
          ? gt(integrationGoogleAdsModel.id, input.afterId)
          : undefined,
      )
      .orderBy(asc(integrationGoogleAdsModel.id))
      .limit(input.limit)
  },

  /** Platform runbook: customer ids to register with Google (gTech allowlisting). */
  async listConnectedCustomerIds(tx: DatabaseClient = db): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ customerId: integrationGoogleAdsModel.customerId })
      .from(integrationGoogleAdsModel)

    return rows.map((row) => row.customerId)
  },
}
