import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import { facebookMarketingMessageAudienceModel } from "../../schema"
import type { FacebookMarketingMessageAudienceModel } from "../../types"

export const facebookMarketingMessageAudienceRepository = {
  async listByWorkspaceId(
    workspaceId: string,
    filter: {
      adAccountId?: string
      pageId?: string
      readyOnly?: boolean
    } = {},
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel[]> {
    return await tx.query.facebookMarketingMessageAudienceModel.findMany({
      where: {
        workspaceId,
        ...(filter.adAccountId ? { adAccountId: filter.adAccountId } : {}),
        ...(filter.pageId ? { pageId: filter.pageId } : {}),
        ...(filter.readyOnly ? { readyAt: { isNotNull: true as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
    })
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel | null> {
    const row = await tx.query.facebookMarketingMessageAudienceModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  async create(
    input: {
      id: string
      workspaceId: string
      customAudienceId: string
      adAccountId: string
      pageId: string
      name: string
      description: string | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel> {
    const [row] = await tx
      .insert(facebookMarketingMessageAudienceModel)
      .values({ ...input, rowsUploaded: 0 })
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessageAudience")
    }
    return row
  },

  /** Atomic add — concurrent "upload more" calls must not lose counts. */
  async incrementRowsUploaded(
    input: { id: string; workspaceId: string; by: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(facebookMarketingMessageAudienceModel)
      .set({
        rowsUploaded: sql`${facebookMarketingMessageAudienceModel.rowsUploaded} + ${input.by}`,
      })
      .where(
        and(
          eq(facebookMarketingMessageAudienceModel.id, input.id),
          eq(
            facebookMarketingMessageAudienceModel.workspaceId,
            input.workspaceId,
          ),
        ),
      )
  },

  async markReady(
    input: { ids: string[]; workspaceId: string; readyAt: Date },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(facebookMarketingMessageAudienceModel)
      .set({ readyAt: input.readyAt })
      .where(
        and(
          inArray(facebookMarketingMessageAudienceModel.id, input.ids),
          eq(
            facebookMarketingMessageAudienceModel.workspaceId,
            input.workspaceId,
          ),
        ),
      )
  },

  async remove(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(facebookMarketingMessageAudienceModel)
      .where(
        and(
          eq(facebookMarketingMessageAudienceModel.id, input.id),
          eq(
            facebookMarketingMessageAudienceModel.workspaceId,
            input.workspaceId,
          ),
        ),
      )
  },
}
