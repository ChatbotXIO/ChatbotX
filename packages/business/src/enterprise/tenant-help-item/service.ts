import { and, asc, db, eq } from "@chatbotx.io/database/client"
import { tenantHelpItemModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { notFoundException } from "../../errors"

type HelpItemData = {
  name: string
  url: string
  icon?: string | null
  position?: number
}

const cacheTag = (tenantId: string) => `tenant-help:${tenantId}`

export const tenantHelpItemService = {
  listByTenant(tenantId: string) {
    return withCache(
      `tenant-help:${tenantId}`,
      () =>
        db.query.tenantHelpItemModel.findMany({
          where: { tenantId },
          orderBy: (table) => [asc(table.position), asc(table.id)],
        }),
      { tags: [cacheTag(tenantId)] },
    )
  },

  async create(tenantId: string, data: HelpItemData) {
    const [created] = await db
      .insert(tenantHelpItemModel)
      .values({ tenantId, ...data })
      .returning()
    await invalidateCacheByTags([cacheTag(tenantId)])
    return created
  },

  async update(id: string, tenantId: string, data: Partial<HelpItemData>) {
    const [updated] = await db
      .update(tenantHelpItemModel)
      .set(data)
      .where(
        and(
          eq(tenantHelpItemModel.id, id),
          eq(tenantHelpItemModel.tenantId, tenantId),
        ),
      )
      .returning()
    if (!updated) {
      throw notFoundException("Help item not found")
    }
    await invalidateCacheByTags([cacheTag(tenantId)])
    return updated
  },

  async remove(id: string, tenantId: string) {
    const [deleted] = await db
      .delete(tenantHelpItemModel)
      .where(
        and(
          eq(tenantHelpItemModel.id, id),
          eq(tenantHelpItemModel.tenantId, tenantId),
        ),
      )
      .returning({ id: tenantHelpItemModel.id })
    if (!deleted) {
      throw notFoundException("Help item not found")
    }
    await invalidateCacheByTags([cacheTag(tenantId)])
  },
}
