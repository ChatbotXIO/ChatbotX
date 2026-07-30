import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  or,
} from "@chatbotx.io/database/client"
import {
  productCategoryModel,
  productModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

/**
 * A product filed under a sub-category also belongs to that sub-category's
 * parent, so both columns have to be considered wherever a category is matched.
 */
const productInCategory = (
  categoryId: string | typeof productCategoryModel.id,
) =>
  or(
    eq(productModel.categoryId, categoryId),
    eq(productModel.subcategoryId, categoryId),
  )

export const productCategoryRepository = {
  async listWithProductCount(workspaceId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        id: productCategoryModel.id,
        parentId: productCategoryModel.parentId,
        name: productCategoryModel.name,
        rank: productCategoryModel.rank,
        productCount: count(productModel.id),
      })
      .from(productCategoryModel)
      .leftJoin(
        productModel,
        and(
          productInCategory(productCategoryModel.id),
          eq(productModel.workspaceId, workspaceId),
        ),
      )
      .where(eq(productCategoryModel.workspaceId, workspaceId))
      .groupBy(productCategoryModel.id)
      .orderBy(asc(productCategoryModel.rank), asc(productCategoryModel.name))
  },

  async listChildren(
    input: { workspaceId: string; parentId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.productCategoryModel.findMany({
      where: { workspaceId: input.workspaceId, parentId: input.parentId },
      orderBy: { rank: "asc", name: "asc" },
    })
  },

  async list(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.productCategoryModel.findMany({
      where: { workspaceId },
      orderBy: { rank: "asc", name: "asc" },
    })
  },

  async find(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.productCategoryModel.findFirst({
      where: {
        id: input.categoryId,
        workspaceId: input.workspaceId,
      },
    })
  },

  async create(
    input: {
      workspaceId: string
      name: string
      rank?: number
      parentId?: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(productCategoryModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.name,
        rank: input.rank ?? 10,
        parentId: input.parentId ?? null,
      })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      categoryId: string
      name: string
      parentId?: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(productCategoryModel)
      .set({
        name: input.name,
        // `undefined` leaves the row where it is; an explicit `null` promotes a
        // sub-category back to the top level.
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      })
      .where(
        and(
          eq(productCategoryModel.id, input.categoryId),
          eq(productCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(productCategoryModel)
      .where(
        and(
          eq(productCategoryModel.id, input.categoryId),
          eq(productCategoryModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async countProducts(
    input: { workspaceId: string; categoryId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      productModel,
      and(
        eq(productModel.workspaceId, input.workspaceId),
        productInCategory(input.categoryId),
      ),
    )
  },

  async createMissingByName(
    input: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    const names = Array.from(
      new Set(input.names.map((name) => name.trim()).filter(Boolean)),
    )
    if (names.length === 0) {
      return []
    }

    await tx
      .insert(productCategoryModel)
      .values(
        names.map((name) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          name,
        })),
      )
      .onConflictDoNothing({
        target: [
          productCategoryModel.workspaceId,
          productCategoryModel.parentId,
          productCategoryModel.name,
        ],
      })

    // Read back through the same lookup the importer uses, so "which rows do
    // these names mean" is answered in exactly one place.
    return await productCategoryRepository.findByNames(
      { workspaceId: input.workspaceId, names },
      tx,
    )
  },

  async createMissingChildren(
    input: {
      workspaceId: string
      children: Array<{ parentId: string; name: string }>
    },
    tx: DatabaseClient = db,
  ) {
    const children = Array.from(
      new Map(
        input.children
          .map((child) => ({
            parentId: child.parentId,
            name: child.name.trim(),
          }))
          .filter((child) => child.name)
          .map((child) => [`${child.parentId}\u0000${child.name}`, child]),
      ).values(),
    )
    if (children.length === 0) {
      return
    }

    await tx
      .insert(productCategoryModel)
      .values(
        children.map((child) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          parentId: child.parentId,
          name: child.name,
        })),
      )
      .onConflictDoNothing({
        target: [
          productCategoryModel.workspaceId,
          productCategoryModel.parentId,
          productCategoryModel.name,
        ],
      })
  },

  async findByNames(
    input: { workspaceId: string; names: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.names.length === 0) {
      return []
    }
    return await tx.query.productCategoryModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        // Importers name a single category per row, which can only mean a
        // top-level one — a sub-category name is unique only under its parent.
        parentId: { isNull: true },
        name: { in: input.names },
      },
    })
  },
}
