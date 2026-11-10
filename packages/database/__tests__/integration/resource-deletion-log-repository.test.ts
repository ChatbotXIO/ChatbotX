// @vitest-environment node

/** Real-SQL tests for the primary-key-only ResourceDeletionLog repository. */
import { createId } from "@chatbotx.io/utils"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import {
  type ResourceDeletionLogInsert,
  resourceDeletionLogRepository,
} from "../../src/repositories/resource-deletion-log"
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

const buildRow = (
  overrides: Partial<ResourceDeletionLogInsert> &
    Pick<ResourceDeletionLogInsert, "workspaceId" | "resourceId">,
): ResourceDeletionLogInsert => ({
  resourceType: "workspace",
  resourceSubtype: null,
  resourceName: null,
  status: "pending",
  requestedByUserId: null,
  requestSource: null,
  ipAddress: null,
  userAgent: null,
  requestedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  canceledAt: null,
  ...overrides,
})

describe.skipIf(!databaseUrl)(
  "resource deletion log repository against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    test("findPendingIdByResource returns the newest pending row and ignores other statuses", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        const workspaceId = createId()
        const key = {
          workspaceId,
          resourceType: "workspace",
          resourceId: workspaceId,
        } as const
        await resourceDeletionLogRepository.insert(
          buildRow({
            workspaceId,
            resourceId: workspaceId,
            status: "canceled",
          }),
          tx,
        )
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId, resourceId: workspaceId }),
          tx,
        )
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId, resourceId: workspaceId }),
          tx,
        )

        const pendingRows = await tx.query.resourceDeletionLogModel.findMany({
          where: { workspaceId, status: "pending" },
        })
        const newestPendingId = pendingRows
          .map((row) => BigInt(row.id))
          .reduce((max, id) => (id > max ? id : max))

        const found =
          await resourceDeletionLogRepository.findPendingIdByResource(key, tx)

        expect(found).toBe(String(newestPendingId))
      })
    })

    test("completePendingById completes only a pending row, once", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        const workspaceId = createId()
        const completedAt = new Date("2026-02-01T00:00:00.000Z")
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId, resourceId: workspaceId }),
          tx,
        )
        const pendingId =
          await resourceDeletionLogRepository.findPendingIdByResource(
            {
              workspaceId,
              resourceType: "workspace",
              resourceId: workspaceId,
            },
            tx,
          )
        expect(pendingId).toBeDefined()

        const first = await resourceDeletionLogRepository.completePendingById(
          { id: pendingId as string, completedAt },
          tx,
        )
        const repeated =
          await resourceDeletionLogRepository.completePendingById(
            { id: pendingId as string, completedAt: new Date() },
            tx,
          )

        expect(first).toBe(1)
        expect(repeated).toBe(0)
        const row = await tx.query.resourceDeletionLogModel.findFirst({
          where: { id: pendingId as string },
        })
        expect(row?.status).toBe("completed")
        expect(row?.completedAt?.toISOString()).toBe(completedAt.toISOString())
      })
    })

    test("cancelPendingByResource is scoped by workspace and leaves other statuses alone", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        const workspaceId = createId()
        const otherWorkspaceId = createId()
        const resourceId = createId()
        const canceledAt = new Date("2026-03-01T00:00:00.000Z")
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId, resourceId }),
          tx,
        )
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId: otherWorkspaceId, resourceId }),
          tx,
        )
        await resourceDeletionLogRepository.insert(
          buildRow({ workspaceId, resourceId, status: "completed" }),
          tx,
        )

        const updated =
          await resourceDeletionLogRepository.cancelPendingByResource(
            {
              workspaceId,
              resourceType: "workspace",
              resourceId,
              canceledAt,
            },
            tx,
          )

        expect(updated).toBe(1)
        const rows = await tx.query.resourceDeletionLogModel.findMany({
          where: { resourceId },
        })
        const statusByWorkspace = rows
          .map(
            (row) =>
              `${row.workspaceId === workspaceId ? "own" : "other"}:${row.status}`,
          )
          .sort()
        expect(statusByWorkspace).toEqual([
          "other:pending",
          "own:canceled",
          "own:completed",
        ])
      })
    })
  },
)
