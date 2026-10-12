// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { productRepository } from "../../src/repositories/product/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

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

const seedProduct = async (tx: DatabaseClient, sku: string) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `product-import-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `product-import-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  const [product] = await tx
    .insert(schema.productModel)
    .values({ name: "Jean", sku, workspaceId: workspace.id })
    .returning({ id: schema.productModel.id })
  return { workspaceId: workspace.id, productId: product.id }
}

describe.skipIf(!databaseUrl)(
  "productRepository.findByImportIdentifiers (real database)",
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

    // A Meta retailer id is free text (a SKU such as "SKU-RED-01"), but
    // `Product.id` is a bigint: comparing the two as-is makes Postgres reject
    // the whole query, which failed every import of a catalog with SKUs.
    test("matches a non-numeric retailer id by SKU without comparing it to the bigint id", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const { workspaceId, productId } = await seedProduct(tx, "SKU-RED-01")

        const matches = await productRepository.findByImportIdentifiers(
          { workspaceId, retailerIds: ["SKU-RED-01", "abc123xyz"] },
          tx,
        )

        expect(matches.map((product) => product.id)).toEqual([productId])
      })
    })

    test("still matches a retailer id that is our own product id", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const { workspaceId, productId } = await seedProduct(tx, "SKU-1")

        const matches = await productRepository.findByImportIdentifiers(
          { workspaceId, retailerIds: ["not-an-id", productId] },
          tx,
        )

        expect(matches.map((product) => product.id)).toEqual([productId])
      })
    })

    test("does not fail on a number too large for a bigint", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const { workspaceId } = await seedProduct(tx, "SKU-2")

        await expect(
          productRepository.findByImportIdentifiers(
            { workspaceId, retailerIds: ["99999999999999999999999"] },
            tx,
          ),
        ).resolves.toEqual([])
      })
    })

    test("returns nothing for an empty list without querying", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const { workspaceId } = await seedProduct(tx, "SKU-3")

        await expect(
          productRepository.findByImportIdentifiers(
            { workspaceId, retailerIds: [] },
            tx,
          ),
        ).resolves.toEqual([])
      })
    })
  },
)
