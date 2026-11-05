import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { inventoryPolicyTypes } from "@chatbotx.io/database/partials"
import {
  productCategoryModel,
  productModel,
  productVariantModel,
  vendorModel,
} from "@chatbotx.io/database/schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { alias } from "drizzle-orm/pg-core"
import { vendorRepository } from "../vendor/repository"

export type ProductListInput = {
  workspaceId: string
  name?: string | null
  categoryId?: string | null
  /** Only these products — how a picker names the ones already chosen. */
  ids?: string[] | null
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
  vendorId?: string | null
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

/**
 * What a `Product.id` can look like: digits only, short enough for a bigint
 * (18 digits is always in range). Our ids are about 17 digits long.
 */
const PRODUCT_ID_PATTERN = /^\d{1,18}$/

/**
 * What a customer may see in the web shop: active products that are not
 * add-on only, whose category, sub-category and vendor (when set) are
 * visible / active. The query joins `category`, `subcategory` (aliases of
 * the category table) and the vendor table.
 */
const shopVisibleWhere = (input: {
  workspaceId: string
  category: ReturnType<typeof alias<typeof productCategoryModel, "category">>
  subcategory: ReturnType<
    typeof alias<typeof productCategoryModel, "subcategory">
  >
}) =>
  and(
    eq(productModel.workspaceId, input.workspaceId),
    eq(productModel.isActive, true),
    eq(productModel.isAddonOnly, false),
    or(isNull(productModel.categoryId), eq(input.category.isVisible, true)),
    or(
      isNull(productModel.subcategoryId),
      eq(input.subcategory.isVisible, true),
    ),
    or(isNull(productModel.vendorId), eq(vendorModel.isActive, true)),
  )

export const productRepository = {
  async list(input: ProductListInput, tx: DatabaseClient = db) {
    const where = {
      workspaceId: input.workspaceId,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      id: input.ids?.length ? { in: input.ids } : undefined,
      ...inCategory(input.categoryId),
    }
    const pagination = parsePagination(input)
    const orderBy = parseOrderByAsObject(productModel, input)

    const [rows, total] = await Promise.all([
      tx.query.productModel.findMany({
        where,
        with: {
          category: true,
          subcategory: true,
          vendor: { columns: { name: true } },
        },
        orderBy,
        ...pagination,
      }),
      tx.$count(productModel, relationsFilterToSQL(productModel, where)),
    ])

    return {
      data: rows.map(({ category, subcategory, vendor, ...product }) => ({
        ...product,
        inventoryPolicy: inventoryPolicyTypes.parse(product.inventoryPolicy),
        category: category?.name ?? null,
        subcategory: subcategory?.name ?? null,
        vendor: vendor?.name ?? null,
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
        vendor: { columns: { name: true } },
        variantOptions: true,
        variants: true,
        addons: true,
      },
    })
    if (!row) {
      return
    }
    const { category, subcategory, vendor, ...product } = row
    return {
      ...product,
      inventoryPolicy: inventoryPolicyTypes.parse(product.inventoryPolicy),
      category: category?.name ?? null,
      subcategory: subcategory?.name ?? null,
      vendor: vendor?.name ?? null,
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
          vendorId: product.vendorId ?? null,
          inventoryQuantity: product.inventoryQuantity ?? 0,
          inventoryPolicy: product.inventoryPolicy ?? "dont_track",
          allowOutOfStockPurchase: product.allowOutOfStockPurchase ?? false,
          images: product.images ?? [],
          isActive: product.isActive ?? true,
        })),
      )
      .returning()
  },

  async listFormOptions(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [products, vendors] = await Promise.all([
      tx
        .select({ id: productModel.id, name: productModel.name })
        .from(productModel)
        .where(eq(productModel.workspaceId, input.workspaceId))
        .orderBy(asc(productModel.name), asc(productModel.id)),
      vendorRepository.listOptions(input.workspaceId, tx),
    ])
    return { products, vendors }
  },

  async listForCatalogSync(
    input: {
      workspaceId: string
      categoryId?: string
      productIds?: string[]
    },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx.query.productModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...inCategory(input.categoryId),
        id: input.productIds?.length ? { in: input.productIds } : undefined,
      },
      with: {
        category: true,
        subcategory: true,
        vendor: { columns: { name: true } },
        variants: true,
      },
      orderBy: { id: "asc" },
    })
    return rows.map(({ vendor, ...product }) => ({
      ...product,
      vendor: vendor?.name ?? null,
    }))
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
      return []
    }
    return await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          inArray(productModel.id, input.productIds),
        ),
      )
      .returning({ id: productModel.id })
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
    // A retailer ID is free text but `Product.id` is a bigint: Postgres rejects
    // the whole query for a value it cannot cast, so only ids that can be ours
    // are compared to it. Everything is still matched against the SKU.
    const productIds = input.retailerIds.filter((retailerId) =>
      PRODUCT_ID_PATTERN.test(retailerId),
    )
    return await tx
      .select()
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          or(
            productIds.length > 0
              ? inArray(productModel.id, productIds)
              : undefined,
            inArray(sql<string>`btrim(${productModel.sku})`, input.retailerIds),
          ),
        ),
      )
  },

  /**
   * What a customer may see in the web shop: active products that are not
   * add-on only, whose category, sub-category and vendor (when set) are
   * visible / active. `keyword` searches only searchable products.
   */
  /**
   * Shop-visible products like `product`: in its category or sub-category,
   * or sharing a tag with it — never the product itself. The closest first
   * (same sub-category, then same category, then a tag only), then by rank.
   */
  async listRelatedForShop(
    input: {
      workspaceId: string
      product: {
        id: string
        categoryId: string | null
        subcategoryId: string | null
        tags: string[]
      }
      limit: number
    },
    tx: DatabaseClient = db,
  ) {
    const { product } = input
    const categoryIds = [product.categoryId, product.subcategoryId].filter(
      (id): id is string => id !== null,
    )
    const tags = product.tags.filter((tag) => tag.trim() !== "")
    if (categoryIds.length === 0 && tags.length === 0) {
      return []
    }
    const category = alias(productCategoryModel, "category")
    const subcategory = alias(productCategoryModel, "subcategory")
    const sameSubcategory = product.subcategoryId
      ? eq(productModel.subcategoryId, product.subcategoryId)
      : undefined
    const sameCategory = categoryIds.length
      ? or(
          inArray(productModel.categoryId, categoryIds),
          inArray(productModel.subcategoryId, categoryIds),
        )
      : undefined
    // `?|`: the product's tags hold any of these.
    const sharesTag = tags.length
      ? sql`${productModel.tags} ?| array[${sql.join(
          tags.map((tag) => sql`${tag}`),
          sql`, `,
        )}]::text[]`
      : undefined
    const closeness = sql<number>`case
      when ${sameSubcategory ?? sql`false`} then 0
      when ${sameCategory ?? sql`false`} then 1
      else 2 end`
    const rows = await tx
      .select({
        product: productModel,
        vendorName: vendorModel.name,
        vendorDiscountPercent: vendorModel.discountPercent,
        hasVariants: sql<boolean>`exists (select 1 from ${productVariantModel} where ${productVariantModel.productId} = ${productModel.id} and ${productVariantModel.isEnabled})`,
      })
      .from(productModel)
      .leftJoin(category, eq(category.id, productModel.categoryId))
      .leftJoin(subcategory, eq(subcategory.id, productModel.subcategoryId))
      .leftJoin(vendorModel, eq(vendorModel.id, productModel.vendorId))
      .where(
        and(
          shopVisibleWhere({
            workspaceId: input.workspaceId,
            category,
            subcategory,
          }),
          ne(productModel.id, product.id),
          or(sameCategory, sharesTag),
        ),
      )
      .orderBy(closeness, asc(productModel.rank), asc(productModel.name))
      .limit(input.limit)
    return rows.map(
      ({ product: row, vendorName, vendorDiscountPercent, hasVariants }) => ({
        ...row,
        vendor: vendorName,
        vendorDiscountPercent: vendorDiscountPercent ?? 0,
        hasVariants,
      }),
    )
  },

  async listForShop(
    input: {
      workspaceId: string
      keyword?: string | null
      categoryId?: string | null
      vendorId?: string | null
      productIds?: string[] | null
      page?: number
      perPage?: number
    },
    tx: DatabaseClient = db,
  ) {
    const category = alias(productCategoryModel, "category")
    const subcategory = alias(productCategoryModel, "subcategory")
    const keyword = input.keyword?.trim()
    const where = and(
      shopVisibleWhere({
        workspaceId: input.workspaceId,
        category,
        subcategory,
      }),
      input.categoryId
        ? or(
            eq(productModel.categoryId, input.categoryId),
            eq(productModel.subcategoryId, input.categoryId),
          )
        : undefined,
      input.vendorId ? eq(productModel.vendorId, input.vendorId) : undefined,
      input.productIds?.length
        ? inArray(productModel.id, input.productIds)
        : undefined,
      keyword
        ? and(
            eq(productModel.isSearchable, true),
            ilike(productModel.name, likeContains(keyword)),
          )
        : undefined,
    )
    const base = () =>
      tx
        .select({
          product: productModel,
          vendorName: vendorModel.name,
          vendorDiscountPercent: vendorModel.discountPercent,
          // A product with variants is added from its own page, where the
          // customer picks one.
          hasVariants: sql<boolean>`exists (select 1 from ${productVariantModel} where ${productVariantModel.productId} = ${productModel.id} and ${productVariantModel.isEnabled})`,
        })
        .from(productModel)
        .leftJoin(category, eq(category.id, productModel.categoryId))
        .leftJoin(subcategory, eq(subcategory.id, productModel.subcategoryId))
        .leftJoin(vendorModel, eq(vendorModel.id, productModel.vendorId))
        .where(where)
    const pagination = parsePagination(input)
    const query = base().orderBy(asc(productModel.rank), asc(productModel.name))
    const [rows, [counted]] = await Promise.all([
      pagination
        ? query.limit(pagination.limit).offset(pagination.offset)
        : query,
      tx
        .select({ total: count() })
        .from(productModel)
        .leftJoin(category, eq(category.id, productModel.categoryId))
        .leftJoin(subcategory, eq(subcategory.id, productModel.subcategoryId))
        .leftJoin(vendorModel, eq(vendorModel.id, productModel.vendorId))
        .where(where),
    ])
    const total = counted?.total ?? 0
    return {
      data: rows.map(
        ({ product, vendorName, vendorDiscountPercent, hasVariants }) => ({
          ...product,
          vendor: vendorName,
          vendorDiscountPercent: vendorDiscountPercent ?? 0,
          hasVariants,
        }),
      ),
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  /**
   * Id and name of every product a customer may find by message: what the
   * shop shows (see `listForShop`) and marked searchable. Bounded, newest
   * rank first, for matching names against a message in memory.
   */
  async listSearchableNames(
    input: { workspaceId: string; limit: number },
    tx: DatabaseClient = db,
  ) {
    const category = alias(productCategoryModel, "category")
    const subcategory = alias(productCategoryModel, "subcategory")
    return await tx
      .select({ id: productModel.id, name: productModel.name })
      .from(productModel)
      .leftJoin(category, eq(category.id, productModel.categoryId))
      .leftJoin(subcategory, eq(subcategory.id, productModel.subcategoryId))
      .leftJoin(vendorModel, eq(vendorModel.id, productModel.vendorId))
      .where(
        and(
          shopVisibleWhere({
            workspaceId: input.workspaceId,
            category,
            subcategory,
          }),
          eq(productModel.isSearchable, true),
        ),
      )
      .orderBy(asc(productModel.rank), asc(productModel.name))
      .limit(input.limit)
  },

  /**
   * Everything an order line copies from a product: its variants to price a
   * variant line, and the vendor's name kept on the line.
   */
  async findForOrder(
    input: { workspaceId: string; productIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.productIds.length === 0) {
      return []
    }
    return await tx.query.productModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: input.productIds },
      },
      with: {
        variants: true,
        vendor: {
          columns: {
            name: true,
            isActive: true,
            discountPercent: true,
            minimumOrderValue: true,
            openHoursId: true,
          },
        },
      },
    })
  },

  /**
   * Locks the products an order takes stock from, always in id order so two
   * orders sharing products cannot deadlock. Held until the transaction ends,
   * so the stock read here is still true when it is written back.
   */
  async lockForStock(
    input: { workspaceId: string; productIds: string[] },
    tx: DatabaseClient,
  ) {
    if (input.productIds.length === 0) {
      return []
    }
    return await tx
      .select({
        id: productModel.id,
        inventoryPolicy: productModel.inventoryPolicy,
        inventoryQuantity: productModel.inventoryQuantity,
        allowOutOfStockPurchase: productModel.allowOutOfStockPurchase,
      })
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          inArray(productModel.id, input.productIds),
        ),
      )
      .orderBy(asc(productModel.id))
      .for("update")
  },

  /**
   * Takes up to `quantity` from a tracked product, never below zero, and
   * returns the units actually taken. Call it on a row locked with
   * `lockForStock`. Untracked products are left alone (returns 0).
   */
  async takeInventory(
    input: { workspaceId: string; productId: string; quantity: number },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const [row] = await tx
      .select({ inventoryQuantity: productModel.inventoryQuantity })
      .from(productModel)
      .where(
        and(
          eq(productModel.id, input.productId),
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.inventoryPolicy, "track"),
        ),
      )
    if (!row) {
      return 0
    }
    const taken = Math.max(Math.min(input.quantity, row.inventoryQuantity), 0)
    if (taken > 0) {
      await tx
        .update(productModel)
        .set({
          inventoryQuantity: sql`${productModel.inventoryQuantity} - ${taken}`,
        })
        .where(
          and(
            eq(productModel.id, input.productId),
            eq(productModel.workspaceId, input.workspaceId),
          ),
        )
    }
    return taken
  },

  /**
   * Gives back units a cancelled or deleted order took. Not filtered by
   * inventory policy: the units left the stock when the order was placed, so
   * they return even if the product has since stopped being tracked.
   */
  async restoreInventory(
    input: { workspaceId: string; productId: string; quantity: number },
    tx: DatabaseClient = db,
  ) {
    if (input.quantity <= 0) {
      return
    }
    await tx
      .update(productModel)
      .set({
        inventoryQuantity: sql`${productModel.inventoryQuantity} + ${input.quantity}`,
      })
      .where(
        and(
          eq(productModel.id, input.productId),
          eq(productModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
