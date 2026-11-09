import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { integrationWoocommerceModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

type IntegrationWoocommerceInsert =
  typeof integrationWoocommerceModel.$inferInsert

export type IntegrationWoocommerceValues = Omit<
  IntegrationWoocommerceInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId"
>

export const woocommerceRepository = {
  async findIntegration(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.integrationWoocommerceModel.findFirst({
      where: { workspaceId },
    })
  },

  /** One connection per workspace: connecting again replaces it. */
  async upsertIntegration(
    input: { workspaceId: string; values: IntegrationWoocommerceValues },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(integrationWoocommerceModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.values,
      })
      .onConflictDoUpdate({
        target: integrationWoocommerceModel.workspaceId,
        set: { ...input.values, updatedAt: new Date() },
      })
      .returning()
    return row
  },

  async updateIntegration(
    input: {
      workspaceId: string
      values: Partial<IntegrationWoocommerceValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(integrationWoocommerceModel)
      .set({ ...input.values, updatedAt: new Date() })
      .where(eq(integrationWoocommerceModel.workspaceId, input.workspaceId))
      .returning()
    return row
  },

  async deleteIntegration(workspaceId: string, tx: DatabaseClient = db) {
    await tx
      .delete(integrationWoocommerceModel)
      .where(eq(integrationWoocommerceModel.workspaceId, workspaceId))
  },
}
