// @vitest-environment node

/**
 * `ConnectSession` cross-workspace isolation and `claimTarget`'s atomic
 * compare-and-set against a real Postgres. Both were previously tested only
 * against mocked repositories (a mock trivially "proves" whatever behavior
 * it's told to return) — this file proves the actual SQL.
 *
 * `findByIdForWorkspace`/`countActiveByWorkspaceId` tests seed their own
 * fixture inside a transaction that is always rolled back, so nothing is
 * left behind. The `claimTarget` concurrency test needs two REAL, separate
 * connections racing the same row — which requires committed (not
 * in-transaction) rows, since a second connection can't see another
 * connection's uncommitted insert — so that one test seeds and cleans up
 * explicitly instead.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { connectSessionRepository } from "../../src/repositories/connect-session/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

/** Thrown at the end of a fixture transaction so it never commits. */
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

const FUTURE = new Date(Date.now() + 10 * 60 * 1000)

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const [owner] = await tx
    .insert(schema.userModel)
    .values({
      email: `cs-iso-${label}-${Date.now()}-${Math.random()}@example.test`,
    })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `cs-iso-${label}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return { workspaceId: workspace.id, ownerId: owner.id }
}

const seedSession = async (
  tx: DatabaseClient,
  input: { workspaceId: string; actorUserId: string; stateNonceHash: string },
) => {
  const [session] = await tx
    .insert(schema.connectSessionModel)
    .values({
      workspaceId: input.workspaceId,
      provider: "messenger",
      purpose: "connect",
      actorUserId: input.actorUserId,
      stateNonceHash: input.stateNonceHash,
      status: "awaiting_selection",
      step: "select",
      targets: [
        { id: "t1", name: "A", selectable: true },
        { id: "t2", name: "B", selectable: true },
      ],
      claimedTargetIds: [],
      resultConnectionIds: [],
      results: [],
      expiresAt: FUTURE,
    })
    .returning()
  return session
}

describe.skipIf(!databaseUrl)(
  "ConnectSession cross-workspace isolation and claimTarget atomicity against Postgres",
  () => {
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

    test("findByIdForWorkspace returns the session when the workspace matches", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-1",
        })

        const found = await connectSessionRepository.findByIdForWorkspace(
          { id: session.id, workspaceId },
          tx,
        )

        expect(found?.id).toBe(session.id)
      }))

    test("findByIdForWorkspace returns undefined when a DIFFERENT workspace's id/workspaceId pair is queried — a leaked/guessed sessionId from workspace B cannot resolve workspace A's session (regression: cross-workspace session isolation)", () =>
      run(async (tx) => {
        const { workspaceId: workspaceA, ownerId: ownerA } =
          await seedWorkspace(tx, "a")
        const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
        const sessionA = await seedSession(tx, {
          workspaceId: workspaceA,
          actorUserId: ownerA,
          stateNonceHash: "iso-hash-2",
        })

        const foundFromB = await connectSessionRepository.findByIdForWorkspace(
          { id: sessionA.id, workspaceId: workspaceB },
          tx,
        )

        expect(foundFromB).toBeUndefined()
      }))

    test("countActiveByWorkspaceId never counts another workspace's pending sessions", () =>
      run(async (tx) => {
        const { workspaceId: workspaceA, ownerId: ownerA } =
          await seedWorkspace(tx, "a")
        const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
        await seedSession(tx, {
          workspaceId: workspaceA,
          actorUserId: ownerA,
          stateNonceHash: "iso-hash-3",
        })
        await seedSession(tx, {
          workspaceId: workspaceA,
          actorUserId: ownerA,
          stateNonceHash: "iso-hash-4",
        })

        const countB = await connectSessionRepository.countActiveByWorkspaceId(
          { workspaceId: workspaceB },
          tx,
        )
        const countA = await connectSessionRepository.countActiveByWorkspaceId(
          { workspaceId: workspaceA },
          tx,
        )

        expect(countB).toBe(0)
        expect(countA).toBe(2)
      }))

    test("claimTarget's compare-and-set: a second claim of the SAME target after it's already claimed returns false and does not duplicate the array entry", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-5",
        })

        const first = await connectSessionRepository.claimTarget(
          { id: session.id, targetId: "t1" },
          tx,
        )
        const second = await connectSessionRepository.claimTarget(
          { id: session.id, targetId: "t1" },
          tx,
        )

        expect(first).toBe(true)
        expect(second).toBe(false)

        const [row] = await tx
          .select({
            claimedTargetIds: schema.connectSessionModel.claimedTargetIds,
          })
          .from(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(row.claimedTargetIds).toEqual(["t1"])
      }))

    test("claimTarget under REAL concurrency: two separate connections racing the same target — exactly one wins (regression: claimTarget was previously tested only against a mocked repository)", async () => {
      const seedClient = new Client({ connectionString: databaseUrl as string })
      await seedClient.connect()
      const seedDb = createDatabase(seedClient)

      const [owner] = await seedDb
        .insert(schema.userModel)
        .values({
          email: `cs-iso-race-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      const [workspace] = await seedDb
        .insert(schema.workspaceModel)
        .values({ name: "cs-iso-race", ownerId: owner.id })
        .returning({ id: schema.workspaceModel.id })
      const [session] = await seedDb
        .insert(schema.connectSessionModel)
        .values({
          workspaceId: workspace.id,
          provider: "messenger",
          purpose: "connect",
          actorUserId: owner.id,
          stateNonceHash: `iso-hash-race-${Date.now()}`,
          status: "awaiting_selection",
          step: "select",
          targets: [{ id: "race-target", name: "R", selectable: true }],
          claimedTargetIds: [],
          resultConnectionIds: [],
          results: [],
          expiresAt: FUTURE,
        })
        .returning()

      try {
        const clientA = new Client({ connectionString: databaseUrl as string })
        const clientB = new Client({ connectionString: databaseUrl as string })
        await Promise.all([clientA.connect(), clientB.connect()])
        try {
          const dbA = createDatabase(clientA)
          const dbB = createDatabase(clientB)

          const [resultA, resultB] = await Promise.all([
            connectSessionRepository.claimTarget(
              { id: session.id, targetId: "race-target" },
              dbA,
            ),
            connectSessionRepository.claimTarget(
              { id: session.id, targetId: "race-target" },
              dbB,
            ),
          ])

          // Exactly one of the two concurrent callers wins the claim.
          expect([resultA, resultB].filter(Boolean)).toHaveLength(1)

          const [row] = await seedDb
            .select({
              claimedTargetIds: schema.connectSessionModel.claimedTargetIds,
            })
            .from(schema.connectSessionModel)
            .where(eq(schema.connectSessionModel.id, session.id))
          expect(row.claimedTargetIds).toEqual(["race-target"])
        } finally {
          await Promise.all([clientA.end(), clientB.end()])
        }
      } finally {
        await seedDb
          .delete(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, session.id))
        await seedDb
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, workspace.id))
        await seedDb
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, owner.id))
        await seedClient.end()
      }
    })
  },
)
