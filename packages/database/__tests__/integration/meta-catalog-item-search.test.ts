// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { metaCatalogItemRepository } from "../../src/repositories/meta-catalog-item/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const CATALOG_ID = "catalog-1"

class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  db: DatabaseClient,
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

/** A catalog with two linked products: "Jean" (SKU-1) and "Shirt" (SKU-2). */
const seedCatalog = async (tx: DatabaseClient) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `meta-catalog-search-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `meta-catalog-search-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  const [integration] = await tx
    .insert(schema.integrationModel)
    .values({ workspaceId: workspace.id, integrationType: "metaCatalog" })
    .returning({ id: schema.integrationModel.id })
  const [connection] = await tx
    .insert(schema.integrationMetaCatalogModel)
    .values({
      workspaceId: workspace.id,
      integrationId: integration.id,
      catalogId: CATALOG_ID,
    })
    .returning({ id: schema.integrationMetaCatalogModel.id })

  for (const [name, retailerId] of [
    ["Jean", "SKU-1"],
    ["Shirt", "SKU-2"],
  ] as const) {
    const [product] = await tx
      .insert(schema.productModel)
      .values({ name, sku: retailerId, workspaceId: workspace.id })
      .returning({ id: schema.productModel.id })
    await tx.insert(schema.metaCatalogItemModel).values({
      integrationMetaCatalogId: connection.id,
      catalogId: CATALOG_ID,
      productId: product.id,
      retailerId,
    })
  }

  return { integrationMetaCatalogId: connection.id, catalogId: CATALOG_ID }
}

describe.skipIf(!databaseUrl)(
  "metaCatalogItemRepository.searchWithProductInfo (real database)",
  () => {
    let client: Client
    let db: DatabaseClient

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      db = drizzle({ client, schema, relations }) as unknown as DatabaseClient
    })

    afterAll(async () => {
      await client.end()
    })

    test("finds exactly the item whose retailer id is asked for, so a saved pick can be shown by name", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const scope = await seedCatalog(tx)

        const found = await metaCatalogItemRepository.searchWithProductInfo(
          { ...scope, retailerId: "SKU-2" },
          tx,
        )

        expect(found.map((item) => [item.retailerId, item.name])).toEqual([
          ["SKU-2", "Shirt"],
        ])
      })
    })

    test("finds nothing for a retailer id the catalog does not have", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const scope = await seedCatalog(tx)

        await expect(
          metaCatalogItemRepository.searchWithProductInfo(
            { ...scope, retailerId: "missing" },
            tx,
          ),
        ).resolves.toEqual([])
      })
    })

    test("still lists by name when no retailer id is given", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const scope = await seedCatalog(tx)

        const all = await metaCatalogItemRepository.searchWithProductInfo(
          scope,
          tx,
        )
        const byName = await metaCatalogItemRepository.searchWithProductInfo(
          { ...scope, keyword: "jea" },
          tx,
        )

        expect(all.map((item) => item.name)).toEqual(["Jean", "Shirt"])
        expect(byName.map((item) => item.name)).toEqual(["Jean"])
      })
    })

    test("never reaches into another catalog", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const scope = await seedCatalog(tx)

        await expect(
          metaCatalogItemRepository.searchWithProductInfo(
            { ...scope, catalogId: "other-catalog", retailerId: "SKU-1" },
            tx,
          ),
        ).resolves.toEqual([])
      })
    })
  },
)
