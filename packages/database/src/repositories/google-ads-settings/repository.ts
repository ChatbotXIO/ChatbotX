import { type DatabaseClient, db, eq } from "../../client"
import type { GoogleAdsSettingsDocument } from "../../partials"
import { googleAdsSettingsModel } from "../../schema"
import type { GoogleAdsSettingsModel } from "../../types"

export type UpsertGoogleAdsSettingsInput = {
  workspaceId: string
  settings: GoogleAdsSettingsDocument
}

/** Raw access only: validation and versioning belong to the service. */
export const googleAdsSettingsRepository = {
  async findByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsSettingsModel | null> {
    const [row] = await tx
      .select()
      .from(googleAdsSettingsModel)
      .where(eq(googleAdsSettingsModel.workspaceId, workspaceId))
      .limit(1)

    return row ?? null
  },

  /** Atomic create-or-replace on the workspace's unique key. */
  async upsertSettings(
    input: UpsertGoogleAdsSettingsInput,
    tx: DatabaseClient = db,
  ): Promise<GoogleAdsSettingsModel> {
    const [row] = await tx
      .insert(googleAdsSettingsModel)
      .values({
        workspaceId: input.workspaceId,
        settings: input.settings,
      })
      .onConflictDoUpdate({
        target: googleAdsSettingsModel.workspaceId,
        set: { settings: input.settings },
      })
      .returning()

    if (!row) {
      throw new Error("Failed to upsert Google Ads settings")
    }
    return row
  },
}
