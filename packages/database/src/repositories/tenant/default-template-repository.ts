import type { EncryptedData } from "@chatbotx.io/encryption"
import { type DatabaseClient, db, eq } from "../../client"
import type { TenantDefaultTemplateAction } from "../../partials/template"
import {
  templateModel,
  tenantDefaultTemplateEventModel,
  tenantDefaultTemplateModel,
} from "../../schema"

const defaultTemplateColumns = () => ({
  id: templateModel.id,
  tenantId: templateModel.tenantId,
  name: templateModel.name,
  workspaceId: templateModel.workspaceId,
  formatVersion: templateModel.formatVersion,
  version: templateModel.version,
  updatedAt: templateModel.updatedAt,
  deletedAt: templateModel.deletedAt,
  shareEnabled: templateModel.shareEnabled,
  shareExpiresAt: templateModel.shareExpiresAt,
  shareToken: templateModel.shareToken,
  defaultPermissions: templateModel.defaultPermissions,
  defaultAutoUpdate: templateModel.defaultAutoUpdate,
})

export const tenantDefaultTemplateRepository = {
  async findWithTemplate(tenantId: string, client: DatabaseClient = db) {
    const [row] = await client
      .select({
        keyHash: tenantDefaultTemplateModel.keyHash,
        encryptedKey: tenantDefaultTemplateModel.encryptedKey,
        template: defaultTemplateColumns(),
      })
      .from(tenantDefaultTemplateModel)
      .innerJoin(
        templateModel,
        eq(templateModel.id, tenantDefaultTemplateModel.templateId),
      )
      .where(eq(tenantDefaultTemplateModel.tenantId, tenantId))
      .limit(1)
    return row ?? null
  },

  async upsert(
    input: {
      tenantId: string
      templateId: string
      keyHash: string
      encryptedKey: EncryptedData
    },
    client: DatabaseClient = db,
  ): Promise<void> {
    await client
      .insert(tenantDefaultTemplateModel)
      .values(input)
      .onConflictDoUpdate({
        target: tenantDefaultTemplateModel.tenantId,
        set: {
          templateId: input.templateId,
          keyHash: input.keyHash,
          encryptedKey: input.encryptedKey,
        },
      })
  },

  async delete(
    tenantId: string,
    client: DatabaseClient = db,
  ): Promise<string | null> {
    const [removed] = await client
      .delete(tenantDefaultTemplateModel)
      .where(eq(tenantDefaultTemplateModel.tenantId, tenantId))
      .returning({ templateId: tenantDefaultTemplateModel.templateId })
    return removed?.templateId ?? null
  },

  async recordEvent(
    input: {
      tenantId: string
      action: TenantDefaultTemplateAction
      templateId: string
      actorUserId: string
    },
    client: DatabaseClient = db,
  ): Promise<void> {
    await client.insert(tenantDefaultTemplateEventModel).values(input)
  },
}
