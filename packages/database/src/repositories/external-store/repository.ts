import {
  and,
  count,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  like,
  notInArray,
  or,
} from "@chatbotx.io/database/client"
import type { ExternalStoreSource } from "@chatbotx.io/database/partials"
import {
  discountCodeModel,
  productModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export type ExternalProductValues = Omit<
  typeof productModel.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId" | "source" | "externalId"
>

export type ExternalVariantValues = {
  externalId: string
  externalInventoryItemId: string | null
  combination: Record<string, string>
  price: number
  sku: string | null
  inventoryQuantity: number | null
  isEnabled: boolean
}

export type ExternalDiscountValues = Omit<
  typeof discountCodeModel.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId" | "source" | "externalId"
>

/**
 * The catalog rows mirrored from an external store (Shopify, WooCommerce):
 * every read and write is scoped to the workspace and the store's `source`.
 */
export const externalStoreRepository = {
  /**
   * Writes a product mirrored from an external store with its options and
   * variants, the store's status included — it is the only writer of a
   * mirrored product's `status`.
   * Variants keep their ids across syncs — carts and order lines
   * point at them — so they are matched by the store's id, not replaced.
   */
  async upsertProduct(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalId: string
      values: ExternalProductValues
      options: Array<{ name: string; values: string[]; position: number }>
      variants: ExternalVariantValues[]
    },
    tx: DatabaseClient = db,
  ) {
    // One transaction: the upsert locks the product row, so a sync and a
    // webhook writing the same product wait for each other instead of both
    // replacing its options and variants.
    return await tx.transaction(async (client) => {
      const [product] = await client
        .insert(productModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          source: input.source,
          externalId: input.externalId,
          ...input.values,
        })
        .onConflictDoUpdate({
          target: [
            productModel.workspaceId,
            productModel.source,
            productModel.externalId,
          ],
          targetWhere: isNotNull(productModel.externalId),
          set: {
            ...input.values,
            updatedAt: new Date(),
          },
        })
        .returning()
      if (!product) {
        throw new Error("Failed to save the mirrored product")
      }

      await client
        .delete(productVariantOptionModel)
        .where(eq(productVariantOptionModel.productId, product.id))
      if (input.options.length > 0) {
        await client.insert(productVariantOptionModel).values(
          input.options.map((option) => ({
            id: createId(),
            productId: product.id,
            name: option.name,
            values: option.values,
            position: option.position,
          })),
        )
      }

      const existing = await client
        .select({
          id: productVariantModel.id,
          externalId: productVariantModel.externalId,
        })
        .from(productVariantModel)
        .where(eq(productVariantModel.productId, product.id))
      const idByExternal = new Map(
        existing.flatMap((variant) =>
          variant.externalId ? [[variant.externalId, variant.id] as const] : [],
        ),
      )
      const keep: string[] = []
      for (const variant of input.variants) {
        const id = idByExternal.get(variant.externalId)
        if (id) {
          keep.push(id)
          await client
            .update(productVariantModel)
            .set({ ...variant, updatedAt: new Date() })
            .where(eq(productVariantModel.id, id))
        } else {
          const newId = createId()
          keep.push(newId)
          await client
            .insert(productVariantModel)
            .values({ id: newId, productId: product.id, ...variant })
        }
      }
      await client
        .delete(productVariantModel)
        .where(
          keep.length > 0
            ? and(
                eq(productVariantModel.productId, product.id),
                notInArray(productVariantModel.id, keep),
              )
            : eq(productVariantModel.productId, product.id),
        )
      return product
    })
  },

  async deleteProductByExternalId(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalId: string
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
          eq(productModel.externalId, input.externalId),
        ),
      )
  },

  /** After a full sync: the mirrored products the store no longer has. */
  async deleteProductsNotIn(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      keepExternalIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
          ...(input.keepExternalIds.length > 0
            ? [notInArray(productModel.externalId, input.keepExternalIds)]
            : []),
        ),
      )
  },

  async countProducts(
    input: { workspaceId: string; source: ExternalStoreSource },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({ value: count() })
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
        ),
      )
    return row?.value ?? 0
  },

  /**
   * Our product and variant for each of the store's variant ids, so an
   * order line from the store links back to the product it sold.
   */
  async findVariantsByExternalIds(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.externalIds.length === 0) {
      return []
    }
    return await tx
      .select({
        externalId: productVariantModel.externalId,
        variantId: productVariantModel.id,
        combination: productVariantModel.combination,
        productId: productModel.id,
        categoryId: productModel.categoryId,
        vendorId: productModel.vendorId,
      })
      .from(productVariantModel)
      .innerJoin(
        productModel,
        eq(productModel.id, productVariantModel.productId),
      )
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
          inArray(productVariantModel.externalId, input.externalIds),
        ),
      )
  },

  /**
   * The variants that order one of these WooCommerce variations: the
   * variation's own (`externalId` = its id) and those expanded from its
   * "Any …" attributes (`{id}~…`), with their product.
   */
  async findVariantsForVariations(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      variationIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.variationIds.length === 0) {
      return []
    }
    return await tx
      .select({
        externalId: productVariantModel.externalId,
        variantId: productVariantModel.id,
        combination: productVariantModel.combination,
        productId: productModel.id,
        productExternalId: productModel.externalId,
        categoryId: productModel.categoryId,
        vendorId: productModel.vendorId,
      })
      .from(productVariantModel)
      .innerJoin(
        productModel,
        eq(productModel.id, productVariantModel.productId),
      )
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
          or(
            inArray(productVariantModel.externalId, input.variationIds),
            ...input.variationIds.map((id) =>
              like(productVariantModel.externalId, `${id}~%`),
            ),
          ),
        ),
      )
  },

  async findProductsByExternalIds(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.externalIds.length === 0) {
      return []
    }
    return await tx
      .select({
        id: productModel.id,
        externalId: productModel.externalId,
        externalVariantId: productModel.externalVariantId,
        categoryId: productModel.categoryId,
        vendorId: productModel.vendorId,
      })
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, input.source),
          inArray(productModel.externalId, input.externalIds),
        ),
      )
  },

  /**
   * The store's variant id behind each cart line: the variant's own, or the
   * product's default variant (`externalVariantId`) for a product sold
   * without options.
   */
  async findCheckoutVariantIds(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      productIds: string[]
      variantIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    const [products, variants] = await Promise.all([
      input.productIds.length > 0
        ? tx
            .select({
              id: productModel.id,
              externalId: productModel.externalId,
              externalVariantId: productModel.externalVariantId,
            })
            .from(productModel)
            .where(
              and(
                eq(productModel.workspaceId, input.workspaceId),
                eq(productModel.source, input.source),
                inArray(productModel.id, input.productIds),
              ),
            )
        : [],
      input.variantIds.length > 0
        ? tx
            .select({
              id: productVariantModel.id,
              externalId: productVariantModel.externalId,
            })
            .from(productVariantModel)
            .innerJoin(
              productModel,
              eq(productModel.id, productVariantModel.productId),
            )
            .where(
              and(
                eq(productModel.workspaceId, input.workspaceId),
                eq(productModel.source, input.source),
                inArray(productVariantModel.id, input.variantIds),
              ),
            )
        : [],
    ])
    return {
      byProduct: new Map(
        products.map((product) => [product.id, product.externalVariantId]),
      ),
      byVariant: new Map(
        variants.map((variant) => [variant.id, variant.externalId]),
      ),
      /** The store's own product id, for a store that orders by product. */
      productExternalIds: new Map(
        products.map((product) => [product.id, product.externalId]),
      ),
    }
  },

  async upsertDiscount(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalId: string
      values: ExternalDiscountValues
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(discountCodeModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        source: input.source,
        externalId: input.externalId,
        ...input.values,
      })
      .onConflictDoUpdate({
        target: [
          discountCodeModel.workspaceId,
          discountCodeModel.source,
          discountCodeModel.externalId,
        ],
        targetWhere: isNotNull(discountCodeModel.externalId),
        set: { ...input.values, updatedAt: new Date() },
      })
      .returning()
    return row
  },

  async deleteDiscountByExternalId(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      externalId: string
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.source, input.source),
          eq(discountCodeModel.externalId, input.externalId),
        ),
      )
  },

  /** After a full sync: the mirrored codes the store no longer has. */
  async deleteDiscountsNotIn(
    input: {
      workspaceId: string
      source: ExternalStoreSource
      keepExternalIds: string[]
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.source, input.source),
          ...(input.keepExternalIds.length > 0
            ? [notInArray(discountCodeModel.externalId, input.keepExternalIds)]
            : []),
        ),
      )
  },
}
