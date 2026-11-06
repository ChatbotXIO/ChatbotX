import {
  and,
  count,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  notInArray,
} from "@chatbotx.io/database/client"
import {
  discountCodeModel,
  integrationShopifyModel,
  productModel,
  productVariantModel,
  productVariantOptionModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

type IntegrationShopifyInsert = typeof integrationShopifyModel.$inferInsert

export type IntegrationShopifyValues = Omit<
  IntegrationShopifyInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId"
>

export type ShopifyProductValues = Omit<
  typeof productModel.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId" | "source" | "externalId"
>

export type ShopifyVariantValues = {
  externalId: string
  externalInventoryItemId: string | null
  combination: Record<string, string>
  price: number
  sku: string | null
  inventoryQuantity: number | null
  isEnabled: boolean
}

export type ShopifyDiscountValues = Omit<
  typeof discountCodeModel.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "workspaceId" | "source" | "externalId"
>

export const shopifyRepository = {
  async findIntegration(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.integrationShopifyModel.findFirst({
      where: { workspaceId },
    })
  },

  /** One connection per workspace: connecting again replaces it. */
  async upsertIntegration(
    input: { workspaceId: string; values: IntegrationShopifyValues },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(integrationShopifyModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.values,
      })
      .onConflictDoUpdate({
        target: integrationShopifyModel.workspaceId,
        set: { ...input.values, updatedAt: new Date() },
      })
      .returning()
    return row
  },

  async updateIntegration(
    input: {
      workspaceId: string
      values: Partial<IntegrationShopifyValues>
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(integrationShopifyModel)
      .set({ ...input.values, updatedAt: new Date() })
      .where(eq(integrationShopifyModel.workspaceId, input.workspaceId))
      .returning()
    return row
  },

  async deleteIntegration(workspaceId: string, tx: DatabaseClient = db) {
    await tx
      .delete(integrationShopifyModel)
      .where(eq(integrationShopifyModel.workspaceId, workspaceId))
  },

  /**
   * Writes a Shopify product with its options and variants, Shopify's status
   * included — it is the only writer of a Shopify product's `status`.
   * Variants keep their ids across syncs — carts and order lines
   * point at them — so they are matched by Shopify's id, not replaced.
   */
  async upsertProduct(
    input: {
      workspaceId: string
      externalId: string
      values: ShopifyProductValues
      options: Array<{ name: string; values: string[]; position: number }>
      variants: ShopifyVariantValues[]
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
          source: "shopify",
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
        throw new Error("Failed to save the Shopify product")
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
    input: { workspaceId: string; externalId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, "shopify"),
          eq(productModel.externalId, input.externalId),
        ),
      )
  },

  /** After a full sync: the Shopify products the store no longer has. */
  async deleteProductsNotIn(
    input: { workspaceId: string; keepExternalIds: string[] },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(productModel)
      .where(
        and(
          eq(productModel.workspaceId, input.workspaceId),
          eq(productModel.source, "shopify"),
          ...(input.keepExternalIds.length > 0
            ? [notInArray(productModel.externalId, input.keepExternalIds)]
            : []),
        ),
      )
  },

  async countProducts(workspaceId: string, tx: DatabaseClient = db) {
    const [row] = await tx
      .select({ value: count() })
      .from(productModel)
      .where(
        and(
          eq(productModel.workspaceId, workspaceId),
          eq(productModel.source, "shopify"),
        ),
      )
    return row?.value ?? 0
  },

  /**
   * Our product and variant for each Shopify variant id, so an order line
   * from Shopify links back to the product it sold.
   */
  async findVariantsByExternalIds(
    input: { workspaceId: string; externalIds: string[] },
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
          eq(productModel.source, "shopify"),
          inArray(productVariantModel.externalId, input.externalIds),
        ),
      )
  },

  async findProductsByExternalIds(
    input: { workspaceId: string; externalIds: string[] },
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
          eq(productModel.source, "shopify"),
          inArray(productModel.externalId, input.externalIds),
        ),
      )
  },

  /**
   * The Shopify variant GID behind each cart line: the variant's own, or the
   * product's default variant for a product sold without options.
   */
  async findCheckoutVariantIds(
    input: { workspaceId: string; productIds: string[]; variantIds: string[] },
    tx: DatabaseClient = db,
  ) {
    const [products, variants] = await Promise.all([
      input.productIds.length > 0
        ? tx
            .select({
              id: productModel.id,
              externalVariantId: productModel.externalVariantId,
            })
            .from(productModel)
            .where(
              and(
                eq(productModel.workspaceId, input.workspaceId),
                eq(productModel.source, "shopify"),
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
                eq(productModel.source, "shopify"),
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
    }
  },

  async upsertDiscount(
    input: {
      workspaceId: string
      externalId: string
      values: ShopifyDiscountValues
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(discountCodeModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        source: "shopify",
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
    input: { workspaceId: string; externalId: string },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.source, "shopify"),
          eq(discountCodeModel.externalId, input.externalId),
        ),
      )
  },

  /** After a full sync: the Shopify codes the store no longer has. */
  async deleteDiscountsNotIn(
    input: { workspaceId: string; keepExternalIds: string[] },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(discountCodeModel)
      .where(
        and(
          eq(discountCodeModel.workspaceId, input.workspaceId),
          eq(discountCodeModel.source, "shopify"),
          ...(input.keepExternalIds.length > 0
            ? [notInArray(discountCodeModel.externalId, input.keepExternalIds)]
            : []),
        ),
      )
  },
}
