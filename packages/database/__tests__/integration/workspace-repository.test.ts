// @vitest-environment node

/** Real-SQL regression tests for workspace reuse queries. */
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { workspaceRepository } from "../../src/repositories/workspace/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, relations, schema })

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

describe.skipIf(!databaseUrl)("workspace repository against Postgres", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  test("findEmptyActiveByOwner skips the oldest workspace when it already has an Inbox", async () => {
    const suffix = `${Date.now()}-${Math.random()}`
    await withRolledBackTransaction(createDatabase(client), async (tx) => {
      const [owner] = await tx
        .insert(schema.userModel)
        .values({ email: `workspace-repository-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      const [workspaceWithInbox] = await tx
        .insert(schema.workspaceModel)
        .values({ name: `connected-${suffix}`, ownerId: owner.id })
        .returning({ id: schema.workspaceModel.id })
      const [emptyWorkspace] = await tx
        .insert(schema.workspaceModel)
        .values({ name: `empty-${suffix}`, ownerId: owner.id })
        .returning({ id: schema.workspaceModel.id })

      await tx.insert(schema.inboxModel).values({
        channel: "webchat",
        name: `inbox-${suffix}`,
        sourceId: `source-${suffix}`,
        workspaceId: workspaceWithInbox.id,
      })

      const target = await workspaceRepository.findEmptyActiveByOwner(
        { ownerId: owner.id },
        tx,
      )

      expect(target?.id).toBe(emptyWorkspace.id)
      expect(target?.id).not.toBe(workspaceWithInbox.id)
    })
  })
})
