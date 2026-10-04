// @vitest-environment node

/**
 * Real-Postgres coverage for workspace isolation and atomic target claims.
 * Transactional fixtures roll back; the two-connection race cleans up its
 * committed fixture explicitly.
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

    test("findByIdForWorkspace rejects a session id from another workspace", () =>
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

    test("findByStateNonceHash resolves the globally unique OAuth callback nonce", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-nonce",
        })

        await expect(
          connectSessionRepository.findByStateNonceHash(
            { stateNonceHash: "iso-hash-nonce" },
            tx,
          ),
        ).resolves.toMatchObject({ id: session.id })
        await expect(
          connectSessionRepository.findByStateNonceHash(
            { stateNonceHash: "missing-nonce" },
            tx,
          ),
        ).resolves.toBeUndefined()
      }))

    test("rejects a session with both actor foreign keys", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const [token] = await tx
          .insert(schema.workspaceApiTokenModel)
          .values({
            workspaceId,
            name: "Connect session actor constraint",
            permission: "full",
            tokenHash: `actor-constraint-${Date.now()}-${Math.random()}`,
            tokenPrefix: "cbx_ws_actor",
          })
          .returning({ id: schema.workspaceApiTokenModel.id })

        await expect(
          tx.transaction(async (nestedTx) => {
            await nestedTx.insert(schema.connectSessionModel).values({
              workspaceId,
              provider: "messenger",
              purpose: "connect",
              actorUserId: ownerId,
              actorTokenId: token.id,
              stateNonceHash: `actor-constraint-${Date.now()}-${Math.random()}`,
              expiresAt: FUTURE,
            })
          }),
        ).rejects.toMatchObject({
          cause: {
            code: "23514",
            constraint: "ConnectSession_actor_at_most_one",
          },
        })
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

    test("countActiveByWorkspaceId excludes terminal and expired active statuses", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-count-active",
        })
        const terminalSession = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-count-terminal",
        })
        const expiredSession = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-count-expired",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ status: "completed", consumedAt: new Date() })
          .where(eq(schema.connectSessionModel.id, terminalSession.id))
        await tx
          .update(schema.connectSessionModel)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(schema.connectSessionModel.id, expiredSession.id))

        await expect(
          connectSessionRepository.countActiveByWorkspaceId(
            { workspaceId },
            tx,
          ),
        ).resolves.toBe(1)
      }))

    test("expireDue expires only due sessions in the requested statuses", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const dueSession = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-expire-due",
        })
        await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-expire-future",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(schema.connectSessionModel.id, dueSession.id))

        await expect(
          connectSessionRepository.expireDue(
            { before: new Date(), statuses: ["awaiting_selection"] },
            tx,
          ),
        ).resolves.toBe(1)
        await expect(
          connectSessionRepository.findById({ id: dueSession.id }, tx),
        ).resolves.toMatchObject({
          status: "expired",
          encryptedAuth: null,
          consumedAt: expect.any(Date),
        })
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
          { id: session.id, workspaceId, targetId: "t1" },
          tx,
        )
        const second = await connectSessionRepository.claimTarget(
          { id: session.id, workspaceId, targetId: "t1" },
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

    test("claimTarget rejects completed and expired sessions", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-claim-state-expiry",
        })

        await tx
          .update(schema.connectSessionModel)
          .set({ status: "completed", consumedAt: new Date() })
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(
          await connectSessionRepository.claimTarget(
            { id: session.id, workspaceId, targetId: "t1" },
            tx,
          ),
        ).toBe(false)

        await tx
          .update(schema.connectSessionModel)
          .set({
            status: "awaiting_selection",
            consumedAt: null,
            expiresAt: new Date(Date.now() - 60_000),
          })
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(
          await connectSessionRepository.claimTarget(
            { id: session.id, workspaceId, targetId: "t1" },
            tx,
          ),
        ).toBe(false)
      }))

    test("releaseTarget preserves a claim outside its workspace, state, and expiry guard", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const { workspaceId: otherWorkspaceId } = await seedWorkspace(
          tx,
          "other",
        )
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-release-guard",
        })
        await connectSessionRepository.claimTarget(
          { id: session.id, workspaceId, targetId: "t1" },
          tx,
        )

        await connectSessionRepository.releaseTarget(
          { id: session.id, workspaceId: otherWorkspaceId, targetId: "t1" },
          tx,
        )
        await tx
          .update(schema.connectSessionModel)
          .set({ status: "completed", consumedAt: new Date() })
          .where(eq(schema.connectSessionModel.id, session.id))
        await connectSessionRepository.releaseTarget(
          { id: session.id, workspaceId, targetId: "t1" },
          tx,
        )
        await tx
          .update(schema.connectSessionModel)
          .set({
            status: "awaiting_selection",
            consumedAt: null,
            expiresAt: new Date(Date.now() - 60_000),
          })
          .where(eq(schema.connectSessionModel.id, session.id))
        await connectSessionRepository.releaseTarget(
          { id: session.id, workspaceId, targetId: "t1" },
          tx,
        )

        const [row] = await tx
          .select({
            claimedTargetIds: schema.connectSessionModel.claimedTargetIds,
          })
          .from(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(row.claimedTargetIds).toEqual(["t1"])
      }))

    test("claimTarget lets exactly one of two concurrent claims win", async () => {
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
              {
                id: session.id,
                workspaceId: workspace.id,
                targetId: "race-target",
              },
              dbA,
            ),
            connectSessionRepository.claimTarget(
              {
                id: session.id,
                workspaceId: workspace.id,
                targetId: "race-target",
              },
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

    test("appendResults does not let a non-selectable/unknown id's outcome count toward completion or success", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-append-1",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } })
          .where(eq(schema.connectSessionModel.id, session.id))

        // Session has two selectable targets (t1, t2). This batch resolves
        // t1 for real and throws in one unknown id — the unknown id must
        // not count as "the second of two" targets.
        const updated = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              { targetId: "t1", status: "connected", connectionId: "conn-1" },
              { targetId: "unknown-id", status: "failed", reason: "unknown" },
            ],
            resultConnectionIds: ["conn-1"],
          },
          tx,
        )

        expect(updated?.status).toBe("awaiting_selection")
        expect(updated?.step).toBe("select")
        expect(updated?.encryptedAuth).not.toBeNull()

        // Completing the real remaining target (t2) now finishes the
        // session — proving the first call's junk id never counted.
        const completed = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              { targetId: "t2", status: "connected", connectionId: "conn-2" },
            ],
            resultConnectionIds: ["conn-2"],
          },
          tx,
        )
        expect(completed?.status).toBe("completed")
        expect(completed?.encryptedAuth).toBeNull()
      }))

    test("appendResults does not treat a non-selectable target's duplicated outcome as the success that completes the batch", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const [session] = await tx
          .insert(schema.connectSessionModel)
          .values({
            workspaceId,
            provider: "messenger",
            purpose: "connect",
            actorUserId: ownerId,
            stateNonceHash: "iso-hash-append-2",
            status: "awaiting_selection",
            step: "select",
            targets: [
              { id: "t1", name: "A", selectable: true },
              {
                id: "already",
                name: "Already connected",
                selectable: false,
                alreadyConnected: "other_workspace",
              },
            ],
            claimedTargetIds: [],
            resultConnectionIds: [],
            results: [],
            expiresAt: FUTURE,
          })
          .returning()

        // Only the non-selectable target's outcome is submitted — the real
        // selectable target (t1) was never attempted, so the batch must not
        // report success/complete.
        const updated = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              {
                targetId: "already",
                status: "duplicated",
                reason: "alreadyConnected",
              },
            ],
            resultConnectionIds: [],
          },
          tx,
        )

        expect(updated?.status).toBe("awaiting_selection")
      }))

    test("appendResults is a no-op (0 rows, returns undefined) on an already-terminal session — a replayed/duplicate batch cannot re-complete or overwrite a finished session", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-append-3",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ status: "completed", consumedAt: new Date() })
          .where(eq(schema.connectSessionModel.id, session.id))

        const result = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [{ targetId: "t1", status: "connected" }],
            resultConnectionIds: [],
          },
          tx,
        )

        expect(result).toBeUndefined()
      }))

    test("appendResults rejects an expired awaiting-selection session", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-append-expiry",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(schema.connectSessionModel.id, session.id))

        const result = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [{ targetId: "t1", status: "connected" }],
            resultConnectionIds: ["conn-1"],
          },
          tx,
        )

        expect(result).toBeUndefined()
      }))

    test("does not mutate an active session outside its workspace", () =>
      run(async (tx) => {
        const { workspaceId: workspaceA, ownerId } = await seedWorkspace(
          tx,
          "a",
        )
        const { workspaceId: workspaceB } = await seedWorkspace(tx, "b")
        const session = await seedSession(tx, {
          workspaceId: workspaceA,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-cross-workspace-mutation",
        })

        await expect(
          connectSessionRepository.updateWhereStatusIn(
            {
              id: session.id,
              workspaceId: workspaceB,
              statuses: ["awaiting_selection"],
              values: { status: "awaiting_selection", step: "callback" },
            },
            tx,
          ),
        ).resolves.toBeUndefined()
        await expect(
          connectSessionRepository.appendResults(
            {
              id: session.id,
              workspaceId: workspaceB,
              results: [{ targetId: "t1", status: "connected" }],
              resultConnectionIds: ["conn-cross-workspace"],
            },
            tx,
          ),
        ).resolves.toBeUndefined()

        await expect(
          connectSessionRepository.findByIdForWorkspace(
            { id: session.id, workspaceId: workspaceA },
            tx,
          ),
        ).resolves.toMatchObject({
          status: "awaiting_selection",
          step: "select",
          results: [],
          resultConnectionIds: [],
        })
      }))

    test("does not update a session outside the allowed statuses", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-guard-1",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ status: "completed", consumedAt: new Date() })
          .where(eq(schema.connectSessionModel.id, session.id))

        const result = await connectSessionRepository.updateWhereStatusIn(
          {
            id: session.id,
            workspaceId,
            statuses: ["pending", "authorized", "awaiting_selection"],
            values: {
              status: "expired",
              consumedAt: new Date(),
              encryptedAuth: null,
            },
          },
          tx,
        )

        expect(result).toBeUndefined()
        const [row] = await tx
          .select({ status: schema.connectSessionModel.status })
          .from(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(row.status).toBe("completed")
      }))

    test("does not update an expired active session when expiration is required", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-active-guard-1",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(schema.connectSessionModel.id, session.id))

        const result = await connectSessionRepository.updateWhereStatusIn(
          {
            id: session.id,
            workspaceId,
            statuses: ["pending", "authorized", "awaiting_selection"],
            values: { status: "awaiting_selection", step: "select" },
            requireUnexpired: true,
          },
          tx,
        )

        expect(result).toBeUndefined()
        const [row] = await tx
          .select({ step: schema.connectSessionModel.step })
          .from(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, session.id))
        expect(row.step).toBe("select")
      }))

    test("enforces terminal cleanup and active reconnect target invariants", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "invariants")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-invariants",
        })

        await expect(
          tx.transaction(
            async (nestedTx) =>
              await nestedTx
                .update(schema.connectSessionModel)
                .set({ status: "completed" })
                .where(eq(schema.connectSessionModel.id, session.id)),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } })

        await expect(
          tx.transaction(
            async (nestedTx) =>
              await nestedTx
                .update(schema.connectSessionModel)
                .set({
                  status: "completed",
                  consumedAt: new Date(),
                  encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" },
                })
                .where(eq(schema.connectSessionModel.id, session.id)),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } })

        await expect(
          tx.transaction(
            async (nestedTx) =>
              await nestedTx
                .update(schema.connectSessionModel)
                .set({ errorCode: "provider_error" })
                .where(eq(schema.connectSessionModel.id, session.id)),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } })

        await expect(
          tx.transaction(
            async (nestedTx) =>
              await nestedTx
                .update(schema.connectSessionModel)
                .set({
                  status: "completed",
                  consumedAt: new Date(),
                  errorCode: "provider_error",
                })
                .where(eq(schema.connectSessionModel.id, session.id)),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } })

        await expect(
          tx.transaction(
            async (nestedTx) =>
              await nestedTx
                .update(schema.connectSessionModel)
                .set({ purpose: "reconnect" })
                .where(eq(schema.connectSessionModel.id, session.id)),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } })
      }))

    test("releaseTarget lets a retry claim the same target again after a failed attempt (claim -> release -> claim)", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-release-1",
        })

        expect(
          await connectSessionRepository.claimTarget(
            { id: session.id, workspaceId, targetId: "t1" },
            tx,
          ),
        ).toBe(true)

        await connectSessionRepository.releaseTarget(
          { id: session.id, workspaceId, targetId: "t1" },
          tx,
        )

        expect(
          await connectSessionRepository.claimTarget(
            { id: session.id, workspaceId, targetId: "t1" },
            tx,
          ),
        ).toBe(true)
      }))

    test("appendResults keeps retryable failures selectable until retried targets resolve", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-retryable-1",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({ encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } })
          .where(eq(schema.connectSessionModel.id, session.id))

        const afterFailure = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              { targetId: "t1", status: "failed", reason: "providerRejected" },
              {
                targetId: "t2",
                status: "limitReached",
                reason: "workspaceLimit",
              },
            ],
            resultConnectionIds: [],
          },
          tx,
        )

        expect(afterFailure).toMatchObject({
          errorCode: null,
          status: "awaiting_selection",
        })
        expect(afterFailure?.encryptedAuth).not.toBeNull()

        const completed = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              { targetId: "t1", status: "connected", connectionId: "conn-1" },
              {
                targetId: "t2",
                status: "duplicated",
                reason: "alreadyConnected",
              },
            ],
            resultConnectionIds: ["conn-1"],
          },
          tx,
        )

        expect(completed?.status).toBe("completed")
        expect(completed?.encryptedAuth).toBeNull()
      }))

    test("appendResults completes an all-duplicated selectable batch without connection ids", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "a")
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-all-duplicates-1",
        })

        const updated = await connectSessionRepository.appendResults(
          {
            id: session.id,
            workspaceId,
            results: [
              {
                targetId: "t1",
                status: "duplicated",
                reason: "alreadyConnected",
              },
              {
                targetId: "t2",
                status: "duplicated",
                reason: "alreadyConnected",
              },
            ],
            resultConnectionIds: [],
          },
          tx,
        )

        expect(updated?.status).toBe("completed")
        expect(updated?.resultConnectionIds).toEqual([])
      }))

    test("completeReconnect only completes an unexpired authorized session in its workspace and clears encrypted auth", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "reconnect")
        const { workspaceId: otherWorkspaceId } = await seedWorkspace(
          tx,
          "reconnect-other",
        )
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-reconnect",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({
            status: "authorized",
            step: "authorize",
            encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" },
          })
          .where(eq(schema.connectSessionModel.id, session.id))

        const rejectedWrongWorkspace =
          await connectSessionRepository.completeReconnect(
            {
              id: session.id,
              workspaceId: otherWorkspaceId,
              result: {
                targetId: "t1",
                status: "connected",
                connectionId: "connection-1",
              },
            },
            tx,
          )
        expect(rejectedWrongWorkspace).toBeUndefined()

        const completed = await connectSessionRepository.completeReconnect(
          {
            id: session.id,
            workspaceId,
            result: {
              targetId: "t1",
              status: "connected",
              connectionId: "connection-1",
            },
          },
          tx,
        )
        expect(completed).toMatchObject({
          status: "completed",
          step: "done",
          encryptedAuth: null,
          resultConnectionIds: ["connection-1"],
        })

        const alreadyCompleted =
          await connectSessionRepository.completeReconnect(
            {
              id: session.id,
              workspaceId,
              result: {
                targetId: "t2",
                status: "connected",
                connectionId: "connection-2",
              },
            },
            tx,
          )
        expect(alreadyCompleted).toBeUndefined()
      }))

    test("completeReconnect rejects an expired authorized session", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(
          tx,
          "reconnect-expired",
        )
        const session = await seedSession(tx, {
          workspaceId,
          actorUserId: ownerId,
          stateNonceHash: "iso-hash-reconnect-expired",
        })
        await tx
          .update(schema.connectSessionModel)
          .set({
            status: "authorized",
            step: "authorize",
            expiresAt: new Date(Date.now() - 60_000),
          })
          .where(eq(schema.connectSessionModel.id, session.id))

        await expect(
          connectSessionRepository.completeReconnect(
            {
              id: session.id,
              workspaceId,
              result: {
                targetId: "t1",
                status: "connected",
                connectionId: "connection-1",
              },
            },
            tx,
          ),
        ).resolves.toBeUndefined()
      }))

    test("appendResults under REAL concurrency: two separate connections each completing a different target merge into one completed session with no lost update", async () => {
      const seedClient = new Client({ connectionString: databaseUrl as string })
      await seedClient.connect()
      const seedDb = createDatabase(seedClient)

      const [owner] = await seedDb
        .insert(schema.userModel)
        .values({
          email: `cs-iso-concurrent-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      const [workspace] = await seedDb
        .insert(schema.workspaceModel)
        .values({ name: "cs-iso-concurrent", ownerId: owner.id })
        .returning({ id: schema.workspaceModel.id })
      const [session] = await seedDb
        .insert(schema.connectSessionModel)
        .values({
          workspaceId: workspace.id,
          provider: "messenger",
          purpose: "connect",
          actorUserId: owner.id,
          stateNonceHash: `iso-hash-concurrent-${Date.now()}`,
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

      try {
        const clientA = new Client({ connectionString: databaseUrl as string })
        const clientB = new Client({ connectionString: databaseUrl as string })
        await Promise.all([clientA.connect(), clientB.connect()])
        try {
          const dbA = createDatabase(clientA)
          const dbB = createDatabase(clientB)

          await Promise.all([
            connectSessionRepository.appendResults(
              {
                id: session.id,
                workspaceId: workspace.id,
                results: [
                  {
                    targetId: "t1",
                    status: "connected",
                    connectionId: "conn-t1",
                  },
                ],
                resultConnectionIds: ["conn-t1"],
              },
              dbA,
            ),
            connectSessionRepository.appendResults(
              {
                id: session.id,
                workspaceId: workspace.id,
                results: [
                  {
                    targetId: "t2",
                    status: "connected",
                    connectionId: "conn-t2",
                  },
                ],
                resultConnectionIds: ["conn-t2"],
              },
              dbB,
            ),
          ])

          const final = await connectSessionRepository.findById(
            { id: session.id },
            seedDb,
          )
          expect(final?.status).toBe("completed")
          expect(final?.results).toHaveLength(2)
          expect(final?.results.map((r) => r.targetId).sort()).toEqual([
            "t1",
            "t2",
          ])
          expect(final?.resultConnectionIds.sort()).toEqual([
            "conn-t1",
            "conn-t2",
          ])
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

    test("purgeOldTerminal deletes a terminal session past retention but leaves a recent terminal session alone", async () => {
      const seedClient = new Client({ connectionString: databaseUrl as string })
      await seedClient.connect()
      const seedDb = createDatabase(seedClient)
      const { workspaceId, ownerId } = await (async () => {
        const [owner] = await seedDb
          .insert(schema.userModel)
          .values({
            email: `cs-iso-purge-${Date.now()}-${Math.random()}@example.test`,
          })
          .returning({ id: schema.userModel.id })
        const [workspace] = await seedDb
          .insert(schema.workspaceModel)
          .values({ name: "cs-iso-purge", ownerId: owner.id })
          .returning({ id: schema.workspaceModel.id })
        return { workspaceId: workspace.id, ownerId: owner.id }
      })()

      const THIRTY_ONE_DAYS_AGO = new Date(
        Date.now() - 31 * 24 * 60 * 60 * 1000,
      )
      const seedTerminal = async (label: string, consumedAt: Date) => {
        const [row] = await seedDb
          .insert(schema.connectSessionModel)
          .values({
            workspaceId,
            provider: "messenger",
            purpose: "connect",
            actorUserId: ownerId,
            stateNonceHash: `iso-hash-purge-${label}-${Date.now()}`,
            status: "completed",
            step: "done",
            targets: [],
            claimedTargetIds: [],
            resultConnectionIds: [],
            results: [],
            expiresAt: FUTURE,
            consumedAt,
          })
          .returning()
        return row
      }
      const oldRow = await seedTerminal("old", THIRTY_ONE_DAYS_AGO)
      const recentRow = await seedTerminal("recent", new Date())

      try {
        const result = await connectSessionRepository.purgeOldTerminal({
          retentionDays: 30,
          chunkSize: 500,
          interChunkDelayMs: 0,
          maxChunks: 10,
        })

        expect(result.deleted).toBeGreaterThanOrEqual(1)
        const oldStillThere = await connectSessionRepository.findById({
          id: oldRow.id,
        })
        expect(oldStillThere).toBeUndefined()
        const recentStillThere = await connectSessionRepository.findById({
          id: recentRow.id,
        })
        expect(recentStillThere).toBeDefined()
      } finally {
        await seedDb
          .delete(schema.connectSessionModel)
          .where(eq(schema.connectSessionModel.id, recentRow.id))
        await seedDb
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, workspaceId))
        await seedDb
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, ownerId))
        await seedClient.end()
      }
    })
  },
)
