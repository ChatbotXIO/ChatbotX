import { type DatabaseClient, db, eq, sql } from "../../client"
import type { AIAgentModelConfig } from "../../partials/ai"
import { inboxTranslationSettingsModel } from "../../schema"
import type { InboxTranslationSettingsModel } from "../../types"

export type UpsertInboxTranslationSettingsInput = {
  workspaceId: string
  enabled: boolean
  /** `null` = not configured. Written explicitly: the column has no default. */
  modelConfig: AIAgentModelConfig | null
}

export const inboxTranslationSettingsRepository = {
  async findByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<InboxTranslationSettingsModel | null> {
    const [row] = await tx
      .select()
      .from(inboxTranslationSettingsModel)
      .where(eq(inboxTranslationSettingsModel.workspaceId, workspaceId))
      .limit(1)

    return row ?? null
  },

  /**
   * Atomic create-or-replace on the workspace's unique key. `enabledAt` is
   * written the first time translation is switched on and never moved after,
   * even if it is switched off and on again.
   */
  async upsert(
    input: UpsertInboxTranslationSettingsInput,
    tx: DatabaseClient = db,
  ): Promise<InboxTranslationSettingsModel> {
    const { workspaceId, enabled, modelConfig } = input
    const [row] = await tx
      .insert(inboxTranslationSettingsModel)
      .values({
        workspaceId,
        enabled,
        modelConfig,
        enabledAt: enabled ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: inboxTranslationSettingsModel.workspaceId,
        set: {
          enabled,
          modelConfig,
          enabledAt: sql`COALESCE(${inboxTranslationSettingsModel.enabledAt}, ${enabled ? sql`CURRENT_TIMESTAMP` : sql`NULL::timestamptz`})`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning()

    if (!row) {
      throw new Error("Failed to upsert inbox translation settings")
    }
    return row
  },
}
