// @vitest-environment node

/**
 * `pipelineItem` contact-filter truth table against a real Postgres: for each
 * of the four attributes a contact with a matching item, with a different item
 * and with no item at all, plus workspace isolation. Every test seeds inside a
 * transaction that is always rolled back.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import {
  type PipelineItemPriority,
  type PipelineItemStatus,
  pipelineSettingsSchema,
} from "../../src/partials/pipeline"
import { buildContactWhere } from "../../src/queries/contact-filter"
import { relations } from "../../src/relations"
import {
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "../../src/repositories/pipeline"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const withRolledBackTransaction = async (
  db: ReturnType<typeof createDatabase>,
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

type World = {
  workspaceId: string
  salesId: string
  supportId: string
  salesStages: [string, string]
  supportStage: string
  openHigh: string
  wonLow: string
  noItem: string
  supportOpen: string
}

const seedPipeline = async (
  tx: DatabaseClient,
  workspaceId: string,
  name: string,
  stageNames: string[],
) => {
  const pipeline = await pipelineRepository.insert(
    {
      workspaceId,
      name,
      type: "opportunity",
      referenceName: name.toLowerCase(),
      currency: "USD",
      settings: pipelineSettingsSchema.parse({}),
    },
    tx,
  )
  const stages = await pipelineStageRepository.insertMany(
    stageNames.map((stageName, position) => ({
      workspaceId,
      pipelineId: pipeline.id,
      name: stageName,
      position,
    })),
    tx,
  )
  return { pipelineId: pipeline.id, stageIds: stages.map((stage) => stage.id) }
}

const seedItem = async (
  tx: DatabaseClient,
  item: {
    workspaceId: string
    pipelineId: string
    stageId: string
    contactId: string
    status: PipelineItemStatus
    priority: PipelineItemPriority
  },
) => {
  const number = await pipelineRepository.nextItemNumber(item.workspaceId, tx)
  await pipelineItemRepository.insertIdempotent(
    {
      ...item,
      number,
      title: `Item ${number}`,
      fieldValues: {},
      stageEnteredAt: new Date(),
    },
    tx,
  )
}

const seedWorld = async (tx: DatabaseClient): Promise<World> => {
  const [user] = await tx
    .insert(schema.userModel)
    .values({ email: `pif-${Date.now()}-${Math.random()}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: "pif", ownerId: user.id })
    .returning({ id: schema.workspaceModel.id })
  const workspaceId = workspace.id
  const contacts = await tx
    .insert(schema.contactModel)
    .values([
      { workspaceId },
      { workspaceId },
      { workspaceId },
      { workspaceId },
    ])
    .returning({ id: schema.contactModel.id })
  const [openHigh, wonLow, noItem, supportOpen] = contacts.map(
    (contact) => contact.id,
  )
  const sales = await seedPipeline(tx, workspaceId, "Sales", ["Lead", "Won"])
  const support = await seedPipeline(tx, workspaceId, "Support", ["Inbox"])

  await seedItem(tx, {
    workspaceId,
    pipelineId: sales.pipelineId,
    stageId: sales.stageIds[0],
    contactId: openHigh,
    status: "open",
    priority: "high",
  })
  await seedItem(tx, {
    workspaceId,
    pipelineId: sales.pipelineId,
    stageId: sales.stageIds[1],
    contactId: wonLow,
    status: "won",
    priority: "low",
  })
  await seedItem(tx, {
    workspaceId,
    pipelineId: support.pipelineId,
    stageId: support.stageIds[0],
    contactId: supportOpen,
    status: "open",
    priority: "medium",
  })

  return {
    workspaceId,
    salesId: sales.pipelineId,
    supportId: support.pipelineId,
    salesStages: [sales.stageIds[0], sales.stageIds[1]],
    supportStage: support.stageIds[0],
    openHigh,
    wonLow,
    noItem,
    supportOpen,
  }
}

describe.skipIf(!databaseUrl)(
  "pipelineItem contact filter against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const run = (fn: (tx: DatabaseClient, world: World) => Promise<void>) =>
      withRolledBackTransaction(createDatabase(client), async (tx) => {
        await fn(tx, await seedWorld(tx))
      })

    const matching = async (
      tx: DatabaseClient,
      world: World,
      condition: Record<string, unknown>,
    ): Promise<string[]> => {
      const where = buildContactWhere({
        workspaceId: world.workspaceId,
        contactFilter: {
          operator: "and",
          conditions: [{ field: "pipelineItem", ...condition }],
        },
      })
      const rows = await tx.query.contactModel.findMany({
        where,
        columns: { id: true },
      })
      return rows.map((row) => row.id).sort()
    }

    const sorted = (...ids: string[]) => [...ids].sort()

    test("exists: has / has no item, any pipeline or one, any status or one", () =>
      run(async (tx, w) => {
        const hasAny = await matching(tx, w, {
          attribute: "exists",
          pipelineId: null,
          operator: "isNotEmpty",
          value: "any",
        })
        expect(hasAny).toEqual(sorted(w.openHigh, w.wonLow, w.supportOpen))

        expect(
          await matching(tx, w, {
            attribute: "exists",
            pipelineId: null,
            operator: "isEmpty",
            value: "any",
          }),
        ).toEqual([w.noItem])

        expect(
          await matching(tx, w, {
            attribute: "exists",
            pipelineId: w.salesId,
            operator: "isNotEmpty",
            value: "open",
          }),
        ).toEqual([w.openHigh])

        expect(
          await matching(tx, w, {
            attribute: "exists",
            pipelineId: w.salesId,
            operator: "isEmpty",
            value: "open",
          }),
        ).toEqual(sorted(w.wonLow, w.noItem, w.supportOpen))
      }))

    test("status: in matches, notIn also matches contacts without an item", () =>
      run(async (tx, w) => {
        expect(
          await matching(tx, w, {
            attribute: "status",
            pipelineId: null,
            operator: "in",
            value: ["won"],
          }),
        ).toEqual([w.wonLow])

        expect(
          await matching(tx, w, {
            attribute: "status",
            pipelineId: null,
            operator: "notIn",
            value: ["won"],
          }),
        ).toEqual(sorted(w.openHigh, w.noItem, w.supportOpen))

        expect(
          await matching(tx, w, {
            attribute: "status",
            pipelineId: w.supportId,
            operator: "in",
            value: ["open", "won"],
          }),
        ).toEqual([w.supportOpen])
      }))

    test("stage: needs the pipeline, notIn includes no-row contacts", () =>
      run(async (tx, w) => {
        expect(
          await matching(tx, w, {
            attribute: "stage",
            pipelineId: w.salesId,
            operator: "in",
            value: [w.salesStages[0]],
          }),
        ).toEqual([w.openHigh])

        expect(
          await matching(tx, w, {
            attribute: "stage",
            pipelineId: w.salesId,
            operator: "notIn",
            value: [w.salesStages[0]],
          }),
        ).toEqual(sorted(w.wonLow, w.noItem, w.supportOpen))

        // A stage of another pipeline matches nothing inside this pipeline.
        expect(
          await matching(tx, w, {
            attribute: "stage",
            pipelineId: w.salesId,
            operator: "in",
            value: [w.supportStage],
          }),
        ).toEqual([])

        // Without a pipeline the condition fails closed.
        expect(
          await matching(tx, w, {
            attribute: "stage",
            pipelineId: null,
            operator: "in",
            value: [w.salesStages[0]],
          }),
        ).toEqual([])
      }))

    test("priority: in / notIn", () =>
      run(async (tx, w) => {
        expect(
          await matching(tx, w, {
            attribute: "priority",
            pipelineId: null,
            operator: "in",
            value: ["high", "low"],
          }),
        ).toEqual(sorted(w.openHigh, w.wonLow))

        expect(
          await matching(tx, w, {
            attribute: "priority",
            pipelineId: w.salesId,
            operator: "notIn",
            value: ["high"],
          }),
        ).toEqual(sorted(w.wonLow, w.noItem, w.supportOpen))
      }))

    test("a pipeline of another workspace never matches", () =>
      run(async (tx, w) => {
        const foreign = await seedWorld(tx)

        expect(
          await matching(tx, w, {
            attribute: "exists",
            pipelineId: foreign.salesId,
            operator: "isNotEmpty",
            value: "any",
          }),
        ).toEqual([])
      }))
  },
)
