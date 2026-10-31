import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  getTableColumns,
} from "@chatbotx.io/database/client"
import {
  placeCategoryModel,
  placeLocationModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/** Every column a place category form or API writes. */
export type PlaceCategoryWriteValues = Omit<
  typeof placeCategoryModel.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
> & { name: string }

export const placeCategoryRepository = {
  /** Every category with how many locations each has, highest priority first. */
  async listWithLocationCount(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        ...getTableColumns(placeCategoryModel),
        locationCount: count(placeLocationModel.id),
      })
      .from(placeCategoryModel)
      .leftJoin(
        placeLocationModel,
        and(
          eq(placeLocationModel.categoryId, placeCategoryModel.id),
          eq(placeLocationModel.workspaceId, workspaceId),
        ),
      )
      .where(eq(placeCategoryModel.workspaceId, workspaceId))
      .groupBy(placeCategoryModel.id)
      .orderBy(
        asc(placeCategoryModel.rank),
        asc(placeCategoryModel.name),
        asc(placeCategoryModel.id),
      )
  },

  async find(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.placeCategoryModel.findFirst({
      where: { id: input.categoryId, workspaceId: input.workspaceId },
    })
  },

  async create(
    input: PlaceCategoryWriteValues & { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(placeCategoryModel)
      .values({ ...input, id: createId() })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      categoryId: string
      values: Partial<PlaceCategoryWriteValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(placeCategoryModel)
      .set(input.values)
      .where(
        and(
          eq(placeCategoryModel.id, input.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async countLocations(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient,
  ) {
    return await tx.$count(
      placeLocationModel,
      and(
        eq(placeLocationModel.categoryId, input.categoryId),
        eq(placeLocationModel.workspaceId, input.workspaceId),
      ),
    )
  },

  async delete(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(placeCategoryModel)
      .where(
        and(
          eq(placeCategoryModel.id, input.categoryId),
          eq(placeCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
