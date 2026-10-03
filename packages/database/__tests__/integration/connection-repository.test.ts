// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { connectionRepository } from "../../src/repositories/connection/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

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

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const suffix = `${label}-${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `connection-repository-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `connection-repository-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return { workspaceId: workspace.id, ownerId: owner.id }
}

const seedIntegrationConnection = async (
  tx: DatabaseClient,
  input: {
    workspaceId: string
    sourceId: string
    displayName?: string
    status?: "connected" | "disconnected" | "needs_reauth"
    integrationId?: string
    statusReason?: "manual"
    disconnectedAt?: Date
  },
) => {
  const integrationId =
    input.integrationId ??
    (
      await tx
        .insert(schema.integrationModel)
        .values({
          workspaceId: input.workspaceId,
          integrationType: "googleSheets",
        })
        .returning({ id: schema.integrationModel.id })
    )[0].id
  const [connection] = await tx
    .insert(schema.connectionModel)
    .values({
      workspaceId: input.workspaceId,
      provider: "googleSheets",
      kind: "integration",
      sourceId: input.sourceId,
      displayName: input.displayName ?? input.sourceId,
      status: input.status ?? "connected",
      statusReason: input.statusReason,
      disconnectedAt: input.disconnectedAt,
      integrationId,
    })
    .returning()
  return connection
}

const expectUniqueViolation = async (operation: Promise<unknown>) => {
  await expect(operation).rejects.toMatchObject({
    cause: { code: "23505" },
  })
}

const waitForRowLock = async (observer: Client, blockedPid: number) => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ wait_event_type: string | null }>(
      "select wait_event_type from pg_stat_activity where pid = $1",
      [blockedPid],
    )
    if (rows[0]?.wait_event_type === "Lock") {
      return
    }
    // PostgreSQL lock state is observable only by polling a second connection; fake timers cannot advance the server's lock lifecycle.
    const nextPoll = Promise.withResolvers<void>()
    setTimeout(nextPoll.resolve, 10)
    await nextPoll.promise
  }
  throw new Error("transaction B did not block on the Connection row lock")
}

describe.skipIf(!databaseUrl)("connectionRepository against Postgres", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  const run = (fn: (tx: DatabaseClient) => Promise<void>) =>
    withRolledBackTransaction(createDatabase(client), fn)

  test("keeps id and provider-source lookups within the requested workspace", () =>
    run(async (tx) => {
      const { workspaceId: workspaceA } = await seedWorkspace(tx, "a")
      const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
      const connection = await seedIntegrationConnection(tx, {
        workspaceId: workspaceA,
        sourceId: "account-1",
      })

      await expect(
        connectionRepository.findByIdForWorkspace(
          { id: connection.id, workspaceId: workspaceA },
          tx,
        ),
      ).resolves.toMatchObject({ id: connection.id })
      await expect(
        connectionRepository.findByIdForWorkspace(
          { id: connection.id, workspaceId: workspaceB },
          tx,
        ),
      ).resolves.toBeUndefined()
      await expect(
        connectionRepository.findByProviderSourceId(
          {
            workspaceId: workspaceB,
            provider: "googleSheets",
            sourceId: "account-1",
          },
          tx,
        ),
      ).resolves.toBeUndefined()
    }))

  test("lists and counts only the requested workspace in public order", () =>
    run(async (tx) => {
      const { workspaceId: workspaceA } = await seedWorkspace(tx, "a")
      const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
      await seedIntegrationConnection(tx, {
        workspaceId: workspaceA,
        sourceId: "account-z",
        displayName: "Zulu",
      })
      await seedIntegrationConnection(tx, {
        workspaceId: workspaceA,
        sourceId: "account-a",
        displayName: "Alpha",
      })
      await seedIntegrationConnection(tx, {
        workspaceId: workspaceB,
        sourceId: "account-a",
        displayName: "Other workspace",
      })

      await expect(
        connectionRepository.list(
          { workspaceId: workspaceA, page: 1, perPage: 1 },
          tx,
        ),
      ).resolves.toMatchObject([{ displayName: "Alpha" }])
      await expect(
        connectionRepository.count({ workspaceId: workspaceA }, tx),
      ).resolves.toBe(2)
    }))

  test("prefers an active match before the newest inactive cross-workspace connection", () =>
    run(async (tx) => {
      const { workspaceId: workspaceA } = await seedWorkspace(tx, "a")
      const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
      const activeConnection = await seedIntegrationConnection(tx, {
        workspaceId: workspaceA,
        sourceId: "account-1",
        status: "connected",
      })
      await seedIntegrationConnection(tx, {
        workspaceId: workspaceB,
        sourceId: "account-1",
        status: "disconnected",
        statusReason: "manual",
        disconnectedAt: new Date(),
      })

      await expect(
        connectionRepository.findByProviderAndSourceIdAnyWorkspace(
          { provider: "googleSheets", sourceId: "account-1" },
          tx,
        ),
      ).resolves.toMatchObject({ id: activeConnection.id })
    }))

  test("uses the newest row when active cross-workspace matches have equal priority", () =>
    run(async (tx) => {
      const { workspaceId: workspaceA } = await seedWorkspace(tx, "a")
      const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
      await seedIntegrationConnection(tx, {
        workspaceId: workspaceA,
        sourceId: "account-1",
      })
      const newestConnection = await seedIntegrationConnection(tx, {
        workspaceId: workspaceB,
        sourceId: "account-1",
      })

      await expect(
        connectionRepository.findByProviderAndSourceIdAnyWorkspace(
          { provider: "googleSheets", sourceId: "account-1" },
          tx,
        ),
      ).resolves.toMatchObject({ id: newestConnection.id })
    }))

  test("enforces the workspace-provider-source unique identity", () =>
    run(async (tx) => {
      const { workspaceId } = await seedWorkspace(tx, "a")
      await seedIntegrationConnection(tx, {
        workspaceId,
        sourceId: "account-1",
      })

      await expectUniqueViolation(
        tx.transaction(async (nestedTx) => {
          await seedIntegrationConnection(nestedTx, {
            workspaceId,
            sourceId: "account-1",
          })
        }),
      )
    }))

  test("enforces unique ownership of an inbox by a connection", () =>
    run(async (tx) => {
      const { workspaceId } = await seedWorkspace(tx, "a")
      const [inbox] = await tx
        .insert(schema.inboxModel)
        .values({
          workspaceId,
          channel: "telegram",
          name: "Connection repository test",
          sourceId: "connection-repository-test",
        })
        .returning({ id: schema.inboxModel.id })
      await tx.insert(schema.connectionModel).values({
        workspaceId,
        provider: "telegram",
        kind: "channel",
        channel: "telegram",
        inboxId: inbox.id,
        sourceId: "bot-1",
        displayName: "Bot one",
      })

      await expectUniqueViolation(
        tx.transaction(async (nestedTx) => {
          await nestedTx.insert(schema.connectionModel).values({
            workspaceId,
            provider: "telegram",
            kind: "channel",
            channel: "telegram",
            inboxId: inbox.id,
            sourceId: "bot-2",
            displayName: "Bot two",
          })
        }),
      )
    }))

  test("enforces unique ownership of an integration by a connection", () =>
    run(async (tx) => {
      const { workspaceId } = await seedWorkspace(tx, "a")
      const [integration] = await tx
        .insert(schema.integrationModel)
        .values({ workspaceId, integrationType: "googleSheets" })
        .returning({ id: schema.integrationModel.id })
      await seedIntegrationConnection(tx, {
        workspaceId,
        sourceId: "account-1",
        integrationId: integration.id,
      })

      await expectUniqueViolation(
        tx.transaction(async (nestedTx) => {
          await seedIntegrationConnection(nestedTx, {
            workspaceId,
            sourceId: "account-2",
            integrationId: integration.id,
          })
        }),
      )
    }))

  test("rejects connection rows that violate the kind or connected-state invariants", () =>
    run(async (tx) => {
      const { workspaceId } = await seedWorkspace(tx, "invariants")

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "integration",
                sourceId: "missing-integration",
                displayName: "Missing integration",
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })

      const [integration] = await tx
        .insert(schema.integrationModel)
        .values({ workspaceId, integrationType: "googleSheets" })
        .returning({ id: schema.integrationModel.id })

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "sub_connection" as never,
                integrationId: integration.id,
                sourceId: "sub-connection-kind",
                displayName: "Sub-connection kind",
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "integration",
                integrationId: integration.id,
                sourceId: "stale-connected-metadata",
                displayName: "Stale metadata",
                statusReason: "manual",
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "integration",
                integrationId: integration.id,
                sourceId: "missing-inactive-reason",
                displayName: "Missing inactive reason",
                status: "needs_reauth",
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "integration",
                integrationId: integration.id,
                sourceId: "missing-disconnect-time",
                displayName: "Missing disconnect time",
                status: "disconnected",
                statusReason: "manual",
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })

      await expect(
        tx.transaction(
          async (nestedTx) =>
            await nestedTx
              .insert(schema.connectionModel)
              .values({
                workspaceId,
                provider: "googleSheets",
                kind: "integration",
                integrationId: integration.id,
                sourceId: "stale-disconnect-time",
                displayName: "Stale disconnect time",
                status: "needs_reauth",
                statusReason: "manual",
                disconnectedAt: new Date(),
              })
              .returning(),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } })
    }))

  test("cascades deleting an integration to its Connection row", () =>
    run(async (tx) => {
      const { workspaceId } = await seedWorkspace(tx, "integration-cascade")
      const [integration] = await tx
        .insert(schema.integrationModel)
        .values({ workspaceId, integrationType: "googleSheets" })
        .returning({ id: schema.integrationModel.id })
      const connection = await seedIntegrationConnection(tx, {
        workspaceId,
        sourceId: "integration-cascade",
        integrationId: integration.id,
      })

      await tx
        .delete(schema.integrationModel)
        .where(eq(schema.integrationModel.id, integration.id))

      await expect(
        connectionRepository.findById({ id: connection.id }, tx),
      ).resolves.toBeUndefined()
    }))

  test("findByIdForUpdate blocks a concurrent writer until its transaction commits", async () => {
    const observerClient = new Client({
      connectionString: databaseUrl as string,
    })
    const transactionAClient = new Client({
      connectionString: databaseUrl as string,
    })
    const transactionBClient = new Client({
      connectionString: databaseUrl as string,
    })
    await Promise.all([
      observerClient.connect(),
      transactionAClient.connect(),
      transactionBClient.connect(),
    ])

    const observerDb = createDatabase(observerClient)
    const transactionADb = createDatabase(transactionAClient)
    const transactionBDb = createDatabase(transactionBClient)
    const lockEstablished = Promise.withResolvers<void>()
    const releaseLock = Promise.withResolvers<void>()
    let workspaceId: string | undefined
    let ownerId: string | undefined
    let transactionAPromise: Promise<void> | undefined
    let transactionBPromise: Promise<void> | undefined

    try {
      const fixture = await seedWorkspace(observerDb, "locking")
      workspaceId = fixture.workspaceId
      ownerId = fixture.ownerId
      const connection = await seedIntegrationConnection(observerDb, {
        workspaceId,
        sourceId: "account-lock",
      })

      transactionAPromise = transactionADb.transaction(async (tx) => {
        await expect(
          connectionRepository.findByIdForUpdate({ id: connection.id }, tx),
        ).resolves.toMatchObject({ id: connection.id })
        lockEstablished.resolve()
        await releaseLock.promise
      })
      await lockEstablished.promise

      const { rows } = await transactionBClient.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      )
      const transactionBPid = rows[0]?.pid
      if (transactionBPid === undefined) {
        throw new Error("could not resolve transaction B backend pid")
      }

      transactionBPromise = transactionBDb.transaction(async (tx) => {
        await tx
          .update(schema.connectionModel)
          .set({ displayName: "Updated after lock" })
          .where(eq(schema.connectionModel.id, connection.id))
      })
      await waitForRowLock(observerClient, transactionBPid)

      releaseLock.resolve()
      await transactionAPromise
      await transactionBPromise
      await expect(
        connectionRepository.findById({ id: connection.id }, observerDb),
      ).resolves.toMatchObject({ displayName: "Updated after lock" })
    } finally {
      releaseLock.resolve()
      await Promise.allSettled(
        [transactionAPromise, transactionBPromise].filter(
          (promise): promise is Promise<void> => promise !== undefined,
        ),
      )
      if (workspaceId) {
        await observerDb
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, workspaceId))
      }
      if (ownerId) {
        await observerDb
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, ownerId))
      }
      await Promise.all([
        observerClient.end(),
        transactionAClient.end(),
        transactionBClient.end(),
      ])
    }
  }, 15_000)
})
