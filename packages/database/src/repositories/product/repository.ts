import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  or,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { inventoryPolicyTypes } from "@chatbotx.io/database/partials"
import { productModel } from "@chatbotx.io/database/schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type ProductListInput = {
  workspaceId: string
  name?: string | null
  categoryId?: string | null
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[] | null
}

export type ProductImportInsert = {
  name: string
  sku?: string | null
  price?: number
  discount?: number
  /** Omit to fall back to the column default. */
  currency?: string
  productUrl?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  categoryId?: string | null
  subcategoryId?: string | null
  tags?: string[]
  vendor?: string | null
  inventoryQuantity?: number
  inventoryPolicy?: "dont_track" | "track"
  allowOutOfStockPurchase?: boolean
  images?: Array<{ url: string; type: "link" | "file" }>
  isActive?: boolean
}

/** Everything a product row needs on insert except its generated id. */
export type ProductInsertValues = Omit<typeof productModel.$inferInsert, "id">
/** A patch: the id and the owning workspace are addressed, never rewritten. */
export type ProductUpdateValues = Partial<
  Omit<typeof productModel.$inferInsert, "id" | "workspaceId">
>

/**
 * Picking a top-level category has to include everything filed under its
 * sub-categories, and the same filter has to work when the picked id *is* a
 * sub-category — so both columns are tried either way. Every category-scoped
 * read shares this, otherwise browsing and syncing would disagree about which
 * products a category contains.
 */
const inCategory = (categoryId?: string | null) =>
  categoryId ? { OR: [{ categoryId }, { subcategoryId: categoryId }] } : {}

export const productRepository = {
  async list(input: ProductListInput, tx: DatabaseClient = db) {
    const where = {
      workspaceId: input.workspaceId,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      ...inCategory(input.categoryId),
    }
    const pagination = parsePagination(input)
    const orderBy = parseOrderByAsObject(productModel, input)

    const [rows, total] = await Promise.all([
      tx.query.productModel.findMany({
        where,
        with: { category: true, subcategory: true },
        orderBy,
        ...pagination,
      }),
      tx.$count(productModel, relationsFilterToSQL(productModel, where)),
    ])

    return {
      data: rows.map(({ category, subcategory, ...product }) => ({
        ...product,
        inventoryPolicy: inventoryPolicyTypes.parse(product.inventoryPolicy),
        category: category?.name ?? null,
        subcategory: subcategory?.name ?? null,
      })),
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  async findDetail(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const row = await tx.query.productModel.findFirst({
      where: input,
      with: {
        category: true,
        subcategory: true,
        variantOptions: true,
        variants: true,
        addons: true,
      },
    })
    if (!row) {
      return
    }
    const { category, subcategory, ...product } = row
    return {
      ...product,
      inventoryPolicy: inventoryPolicyTypes.parse(product.inventoryPolicy),
      category: category?.name ?? null,
      subcategory: subcategory?.name ?? null,
    }
  },

  async createFromImport(
    input: {
      workspaceId: string
      products: ProductImportInsert[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.products.length === 0) {
      return []
    }
    return await tx
      .insert(productModel)
      .values(
        input.products.map((product) => ({
          id: createId(),
          workspaceId: input.workspaceId,
          name: product.name,
          sku: product.sku ?? null,
          price: product.price ?? 0,
          discount: product.discount ?? 0,
          ...(product.currency ? { currency: product.currency } : {}),
          productUrl: product.productUrl ?? null,
          shortDescription: product.shortDescription ?? null,
          longDescription: product.longDescription ?? null,
          categoryId: product.categoryId ?? null,
          subcategoryId: product.subcategoryId ?? null,
          tags: product.tags ?? [],
          vendor: product.vendor ?? null,
          inventoryQuantity: product.inventoryQuantity ?? 0,
          inventoryPolicy: product.inventoryPolicy ?? "dont_track",
          allowOutOfStockPurchase: product.allowOutOfStockPurchase ?? false,
          images: product.images ?? [],
          isActive: product.isActive ?? true,
        })),
      )
      .returning()
  },

  async listDistinctOptions(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const vendorRows = await tx
      .selectDistinct({ value: productModel.vendor })
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          isNotNull(productModel.vendor),
        ),
      )
      .orderBy(asc(productModel.vendor))

    return {
      vendors: Array.from(
        new Set(vendorRows.map(({ value }) => value?.trim()).filter(Boolean)),
      ) as string[],
    }
  },

  async listFormOptions(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [products, suggestions] = await Promise.all([
      tx
        .select({ id: productModel.id, name: productModel.name })
        .from(productModel)
        .where(eq(productModel.workspaceId, input.workspaceId))
        .orderBy(asc(productModel.name), asc(productModel.id)),
      productRepository.listDistinctOptions(input, tx),
    ])
    return { products, ...suggestions }
  },

  async listForCatalogSync(
    input: {
      workspaceId: string
      categoryId?: string
      productIds?: string[]
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.productModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...inCategory(input.categoryId),
        id: input.productIds?.length ? { in: input.productIds } : undefined,
      },
      with: {
        category: true,
        subcategory: true,
        variants: true,
      },
      orderBy: { id: "asc" },
    })
  },

  async create(values: ProductInsertValues, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(productModel)
      .values({ id: createId(), ...values })
      .returning()
    return row
  },

  async update(
    input: {
      workspaceId: string
      productId: string
      values: ProductUpdateValues
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(productModel)
      .set(input.values)
      .where(
        and(
          eq(productModel.id, input.productId),
          eq(productModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: productModel.id })
    return row
  },

  async deleteByIds(
    input: { workspaceId: string; productIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.productIds.length === 0) {
      return
    }
    await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          inArray(productModel.id, input.productIds),
        ),
      )
  },

  /** The bare row, without the relations `findDetail` resolves for the UI. */
  async find(
    input: { workspaceId: string; productId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.productModel.findFirst({
      where: { id: input.productId, workspaceId: input.workspaceId },
    })
  },

  async findByIds(
    input: { workspaceId: string; productIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.productIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          inArray(productModel.id, input.productIds),
        ),
      )
  },

  /**
   * A Meta retailer ID is either our immutable product id or the merchant SKU
   * that was current when the item was submitted. Import uses both identifiers
   * so it can reconnect an item that Meta already knows before a local link row
   * has been written (for example while an outbound batch is still polling).
   */
  async findByImportIdentifiers(
    input: { workspaceId: string; retailerIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.retailerIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          or(
            inArray(productModel.id, input.retailerIds),
            inArray(sql<string>`btrim(${productModel.sku})`, input.retailerIds),
          ),
        ),
      )
  },
}
