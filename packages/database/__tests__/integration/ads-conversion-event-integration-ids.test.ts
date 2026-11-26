// @vitest-environment node

/**
 * `integrationIds` (the Analytics dashboard's multi-inbox selection) against a
 * real PostgreSQL: the list must aggregate exactly the listed integrations,
 * exclude a third one, and override a conflicting single id.
 *
 * Every case runs in a transaction that is rolled back. Skipped unless
 * `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { adsConversionEventRepository as repository } from "../../src/repositories/ads-conversion-event/repository"
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

const OCCURRED_AT = new Date("2026-08-05T12:00:00.000Z")
const RANGE = {
  since: new Date("2026-08-01T00:00:00.000Z"),
  until: new Date("2026-08-10T23:59:59.999Z"),
}

/** One workspace with three Messenger integrations; A has 1 lead, B has 2, C has 4. */
const seed = async (tx: DatabaseClient) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `ads-ids-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `ads-ids-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })

  const leadsByIntegration = [1, 2, 4]
  const integrationIds: string[] = []
  for (const [index, leads] of leadsByIntegration.entries()) {
    const [inbox] = await tx
      .insert(schema.inboxModel)
      .values({
        name: `inbox-${index}`,
        channel: "messenger",
        sourceId: `page-${suffix}-${index}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })
    const [integration] = await tx
      .insert(schema.integrationMessengerModel)
      .values({
        auth: {},
        // No database default exists for these three (see AGENTS.md).
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
        pageId: `page-${suffix}-${index}`,
        name: `page-${index}`,
        workspaceId: workspace.id,
        inboxId: inbox.id,
      })
      .returning({ id: schema.integrationMessengerModel.id })
    integrationIds.push(integration.id)
    for (let n = 0; n < leads; n++) {
      await tx.insert(schema.adsConversionEventModel).values({
        workspaceId: workspace.id,
        channel: "messenger",
        integrationMessengerId: integration.id,
        source: "rule",
        eventType: "lead",
        adId: "ad-1",
        occurredAt: OCCURRED_AT,
        sourceEventId: `evt-${index}-${n}-${suffix}`,
      })
    }
  }
  const [a, b, c] = integrationIds as [string, string, string]
  return { workspaceId: workspace.id, a, b, c }
}

const leadCount = (rows: { eventType: string; count: number }[]): number =>
  rows
    .filter((row) => row.eventType === "lead")
    .reduce((sum, row) => sum + row.count, 0)

describe.skipIf(!databaseUrl)("AdsConversionEvent integrationIds", () => {
  let client: Client
  let db: DatabaseClient

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
    db = drizzle({ client, schema, relations }) as unknown as DatabaseClient
  })

  afterAll(async () => {
    await client.end()
  })

  test("aggregates exactly the listed integrations and excludes the third", async () => {
    await withRolledBackTransaction(db, async (tx) => {
      const { workspaceId, a, b } = await seed(tx)

      const rows = await repository.countConversionEventsByAd(
        { workspaceId, ...RANGE, channel: "messenger", integrationIds: [a, b] },
        tx,
      )

      expect(leadCount(rows)).toBe(3)
    })
  })

  test("a list overrides a conflicting single id instead of intersecting with it", async () => {
    await withRolledBackTransaction(db, async (tx) => {
      const { workspaceId, a, b, c } = await seed(tx)

      const rows = await repository.countConversionEventsByAd(
        {
          workspaceId,
          ...RANGE,
          channel: "messenger",
          integrationMessengerId: c,
          integrationIds: [a, b],
        },
        tx,
      )

      expect(leadCount(rows)).toBe(3)
    })
  })

  test("the single id still scopes when no list is given", async () => {
    await withRolledBackTransaction(db, async (tx) => {
      const { workspaceId, c } = await seed(tx)

      const rows = await repository.countConversionEventsByAd(
        {
          workspaceId,
          ...RANGE,
          channel: "messenger",
          integrationMessengerId: c,
        },
        tx,
      )

      expect(leadCount(rows)).toBe(4)
    })
  })

  test("never reaches another workspace's integration, even when its id is listed", async () => {
    await withRolledBackTransaction(db, async (tx) => {
      const mine = await seed(tx)
      const other = await seed(tx)

      const rows = await repository.countConversionEventsByAd(
        {
          workspaceId: mine.workspaceId,
          ...RANGE,
          channel: "messenger",
          integrationIds: [mine.a, other.a],
        },
        tx,
      )

      expect(leadCount(rows)).toBe(1)
    })
  })
})
