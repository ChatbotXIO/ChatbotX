// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { externalStoreRepository } from "../../src/repositories/external-store/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const productInput = (workspaceId: string) => ({
  workspaceId,
  source: "shopify" as const,
  externalId: "gid://shopify/Product/1",
  values: {
    name: "Tote",
    price: 10,
    currency: "USD",
    status: "active" as const,
  },
  options: [
    { name: "Size", values: ["S", "M"], position: 1 },
    { name: "Color", values: ["Black"], position: 2 },
  ],
  variants: ["S", "M"].map((size) => ({
    externalId: `gid://shopify/ProductVariant/${size}`,
    externalInventoryItemId: null,
    combination: { Size: size, Color: "Black" },
    price: 10,
    sku: null,
    inventoryQuantity: 1,
    isEnabled: true,
  })),
})

// A full sync and a products/update webhook can write the same product at
// once. Each write replaces the options and matches the variants, so without
// one transaction per write the two interleave and duplicate them.
describe.skipIf(!databaseUrl)(
  "externalStoreRepository.upsertProduct under concurrency (real database)",
  () => {
    let pool: Pool
    let db: DatabaseClient
    let userId: string
    let workspaceId: string

    beforeAll(async () => {
      pool = new Pool({ connectionString: databaseUrl as string, max: 4 })
      db = drizzle({
        client: pool,
        schema,
        relations,
      }) as unknown as DatabaseClient
      const suffix = `${Date.now()}-${Math.random()}`
      const [owner] = await db
        .insert(schema.userModel)
        .values({ email: `shopify-upsert-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      const [workspace] = await db
        .insert(schema.workspaceModel)
        .values({ name: `shopify-upsert-${suffix}`, ownerId: owner.id })
        .returning({ id: schema.workspaceModel.id })
      userId = owner.id
      workspaceId = workspace.id
    })

    afterAll(async () => {
      if (!workspaceId) {
        await pool?.end()
        return
      }
      await db
        .delete(schema.productModel)
        .where(eq(schema.productModel.workspaceId, workspaceId))
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, userId))
      await pool.end()
    })

    test("two writes of one product leave one set of options and variants", async () => {
      const input = productInput(workspaceId)
      const [first, second] = await Promise.all([
        externalStoreRepository.upsertProduct(input, db),
        externalStoreRepository.upsertProduct(input, db),
      ])
      expect(first.id).toBe(second.id)

      const options = await db
        .select()
        .from(schema.productVariantOptionModel)
        .where(eq(schema.productVariantOptionModel.productId, first.id))
      const variants = await db
        .select()
        .from(schema.productVariantModel)
        .where(eq(schema.productVariantModel.productId, first.id))
      expect(options).toHaveLength(input.options.length)
      expect(variants).toHaveLength(input.variants.length)
    })

    test("a product follows Shopify's status through draft, unlisted and back to active", async () => {
      const input = productInput(workspaceId)
      await externalStoreRepository.upsertProduct(input, db)
      const drafted = await externalStoreRepository.upsertProduct(
        { ...input, values: { ...input.values, status: "draft" } },
        db,
      )
      expect(drafted.status).toBe("draft")
      const unlisted = await externalStoreRepository.upsertProduct(
        { ...input, values: { ...input.values, status: "unlisted" } },
        db,
      )
      expect(unlisted.status).toBe("unlisted")
      const republished = await externalStoreRepository.upsertProduct(input, db)
      expect(republished.status).toBe("active")
    })
  },
)
