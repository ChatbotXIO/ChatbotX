// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { inboxRepository } from "../../src/repositories/inbox/repository"
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

const seedWorkspace = async (
  tx: DatabaseClient,
  label: string,
  ownerId?: string,
) => {
  const suffix = `${label}-${Date.now()}-${Math.random()}`
  const resolvedOwnerId =
    ownerId ??
    (
      await tx
        .insert(schema.userModel)
        .values({ email: `inbox-repository-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
    )[0].id
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `inbox-repository-${suffix}`, ownerId: resolvedOwnerId })
    .returning({ id: schema.workspaceModel.id })
  return { workspaceId: workspace.id, ownerId: resolvedOwnerId }
}

const seedInbox = async (
  tx: DatabaseClient,
  input: {
    workspaceId: string
    sourceId: string
    status?: "connected" | "disconnected"
    disconnectReason?:
      | "manual"
      | "workspace_purge"
      | "trial_expired"
      | "tenant_suspended"
      | "token_revoked"
  },
) => {
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      workspaceId: input.workspaceId,
      name: input.sourceId,
      channel: "webchat",
      sourceId: input.sourceId,
      status: input.status ?? "connected",
      disconnectReason: input.disconnectReason,
      disconnectedAt: input.disconnectReason ? new Date() : undefined,
    })
    .returning()
  return inbox
}

const seedConnectionForInbox = async (
  tx: DatabaseClient,
  input: { workspaceId: string; inboxId: string; sourceId: string },
) => {
  const [connection] = await tx
    .insert(schema.connectionModel)
    .values({
      workspaceId: input.workspaceId,
      provider: "webchat",
      kind: "channel",
      channel: "webchat",
      inboxId: input.inboxId,
      sourceId: input.sourceId,
      displayName: input.sourceId,
      status: "paused",
      statusReason: "tenant_suspended",
    })
    .returning()
  return connection
}

describe.skipIf(!databaseUrl)("inboxRepository against Postgres", () => {
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

  test("listTenantSuspendedWithoutConnectionByOwner returns only tenant_suspended Inbox rows with no Connection row, scoped to the owner", () =>
    run(async (tx) => {
      const { workspaceId: workspaceA, ownerId } = await seedWorkspace(
        tx,
        "fallback-owner-a",
      )
      const { workspaceId: workspaceB } = await seedWorkspace(
        tx,
        "fallback-owner-b",
        ownerId,
      )
      const { workspaceId: otherWorkspaceId } = await seedWorkspace(
        tx,
        "fallback-other-owner",
      )

      // Eligible: tenant_suspended, disconnected, no Connection row.
      const eligibleA = await seedInbox(tx, {
        workspaceId: workspaceA,
        sourceId: "eligible-a",
        status: "disconnected",
        disconnectReason: "tenant_suspended",
      })
      const eligibleB = await seedInbox(tx, {
        workspaceId: workspaceB,
        sourceId: "eligible-b",
        status: "disconnected",
        disconnectReason: "tenant_suspended",
      })

      // Already backfilled: has a Connection row — must be excluded even
      // though the Inbox row itself still looks tenant_suspended.
      const backfilled = await seedInbox(tx, {
        workspaceId: workspaceA,
        sourceId: "backfilled",
        status: "disconnected",
        disconnectReason: "tenant_suspended",
      })
      await seedConnectionForInbox(tx, {
        workspaceId: workspaceA,
        inboxId: backfilled.id,
        sourceId: "backfilled",
      })

      // Still connected — must be excluded.
      await seedInbox(tx, {
        workspaceId: workspaceA,
        sourceId: "connected",
      })

      // Disconnected for a different reason — must be excluded.
      await seedInbox(tx, {
        workspaceId: workspaceA,
        sourceId: "manual-disconnect",
        status: "disconnected",
        disconnectReason: "manual",
      })

      // tenant_suspended with no Connection row, but a different owner — must be excluded.
      await seedInbox(tx, {
        workspaceId: otherWorkspaceId,
        sourceId: "other-owner",
        status: "disconnected",
        disconnectReason: "tenant_suspended",
      })

      const result =
        await inboxRepository.listTenantSuspendedWithoutConnectionByOwner(
          { ownerId },
          tx,
        )

      expect(result.map((row) => row.id).sort()).toEqual(
        [eligibleA.id, eligibleB.id].sort(),
      )
    }))
})
