// @vitest-environment node

/**
 * `updateIdentityGuarded` against real Postgres concurrency. Both updates are
 * prepared from one snapshot, but the second waits for the first row lock and
 * must append the identity values Postgres sees after the first commit.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db` after applying migrations.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  CONTACT_INBOX_IDENTITY_HISTORY_LIMIT,
  contactInboxRepository,
} from "../../src/repositories/contact-inbox/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import type { ContactInboxIdentityHistoryEntry } from "../../src/schema/contact-inbox"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const ORIGINAL_IDENTITY = {
  sourceId: "phone-original",
  sourceUserId: "user-original",
  sourceParentUserId: "parent-original",
} as const

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const waitForRowLock = async (observer: Client, blockedPid: number) => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ wait_event_type: string | null }>(
      `select wait_event_type
         from pg_stat_activity
        where pid = $1`,
      [blockedPid],
    )
    if (rows[0]?.wait_event_type === "Lock") {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("transaction B did not block on the ContactInbox row lock")
}

describe.skipIf(!databaseUrl)(
  "contactInboxRepository identity history against Postgres",
  () => {
    let observerClient: Client
    let transactionAClient: Client
    let transactionBClient: Client
    let fixtureUserId: string | undefined
    let fixtureWorkspaceId: string | undefined

    const cleanupFixture = async () => {
      if (fixtureWorkspaceId) {
        await createDatabase(observerClient)
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, fixtureWorkspaceId))
        fixtureWorkspaceId = undefined
      }
      if (fixtureUserId) {
        await createDatabase(observerClient)
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, fixtureUserId))
        fixtureUserId = undefined
      }
    }

    beforeAll(async () => {
      observerClient = new Client({ connectionString: databaseUrl as string })
      transactionAClient = new Client({
        connectionString: databaseUrl as string,
      })
      transactionBClient = new Client({
        connectionString: databaseUrl as string,
      })
      await Promise.all([
        observerClient.connect(),
        transactionAClient.connect(),
        transactionBClient.connect(),
      ])
    })

    afterAll(async () => {
      await cleanupFixture()
      await Promise.all([
        observerClient.end(),
        transactionAClient.end(),
        transactionBClient.end(),
      ])
    })

    test("atomically appends locked concurrent updates in order and caps history", async () => {
      const observerDb = createDatabase(observerClient)
      const transactionADb = createDatabase(transactionAClient)
      const transactionBDb = createDatabase(transactionBClient)
      const transactionALocked = Promise.withResolvers<void>()
      const releaseTransactionA = Promise.withResolvers<void>()
      let transactionAPromise: Promise<void> | undefined
      let transactionBPromise: Promise<void> | undefined

      try {
        const fixtureSuffix = `${Date.now()}-${Math.random()}`
        const [user] = await observerDb
          .insert(schema.userModel)
          .values({ email: `identity-history-${fixtureSuffix}@example.test` })
          .returning({ id: schema.userModel.id })
        fixtureUserId = user.id

        const [workspace] = await observerDb
          .insert(schema.workspaceModel)
          .values({ name: "identity-history", ownerId: user.id })
          .returning({ id: schema.workspaceModel.id })
        fixtureWorkspaceId = workspace.id

        const [contact] = await observerDb
          .insert(schema.contactModel)
          .values({ workspaceId: workspace.id })
          .returning({ id: schema.contactModel.id })
        const [inbox] = await observerDb
          .insert(schema.inboxModel)
          .values({
            name: "identity-history",
            channel: "whatsapp",
            sourceId: `identity-history-${fixtureSuffix}`,
            workspaceId: workspace.id,
          })
          .returning({ id: schema.inboxModel.id })
        const [contactInbox] = await observerDb
          .insert(schema.contactInboxModel)
          .values({
            originalContactId: contact.id,
            contactId: contact.id,
            inboxId: inbox.id,
            channel: "whatsapp",
            source: "whatsapp",
            ...ORIGINAL_IDENTITY,
          })
          .returning({ id: schema.contactInboxModel.id })

        const snapshot = { id: contactInbox.id, ...ORIGINAL_IDENTITY }
        const updateA = {
          id: snapshot.id,
          guard: { sourceUserId: snapshot.sourceUserId },
          set: { sourceUserId: "user-after-a" },
          appendIdentityHistory: {
            changedAt: "2026-09-28T01:00:00.000Z",
            reason: "userIdChanged" as const,
          },
        }
        const updateB = {
          id: snapshot.id,
          guard: { sourceId: snapshot.sourceId },
          set: { sourceId: "phone-after-b" },
          appendIdentityHistory: {
            changedAt: "2026-09-28T01:00:01.000Z",
            reason: "phoneChanged" as const,
          },
        }

        transactionAPromise = transactionADb.transaction(async (tx) => {
          await contactInboxRepository.updateIdentityGuarded(updateA, tx)
          transactionALocked.resolve()
          await releaseTransactionA.promise
        })
        await transactionALocked.promise

        const { rows: backendRows } = await transactionBClient.query<{
          pid: number
        }>("select pg_backend_pid() as pid")
        const transactionBPid = backendRows[0]?.pid
        if (transactionBPid === undefined) {
          throw new Error("could not resolve transaction B backend pid")
        }

        transactionBPromise = transactionBDb.transaction(async (tx) => {
          await contactInboxRepository.updateIdentityGuarded(updateB, tx)
        })
        await waitForRowLock(observerClient, transactionBPid)

        releaseTransactionA.resolve()
        await transactionAPromise
        await transactionBPromise

        const [updated] = await observerDb
          .select()
          .from(schema.contactInboxModel)
          .where(eq(schema.contactInboxModel.id, contactInbox.id))

        expect(updated).toMatchObject({
          sourceId: "phone-after-b",
          sourceUserId: "user-after-a",
        })
        expect(updated?.sourceIdentityHistory).toEqual([
          {
            ...ORIGINAL_IDENTITY,
            changedAt: updateA.appendIdentityHistory.changedAt,
            reason: updateA.appendIdentityHistory.reason,
          },
          {
            ...ORIGINAL_IDENTITY,
            sourceUserId: "user-after-a",
            changedAt: updateB.appendIdentityHistory.changedAt,
            reason: updateB.appendIdentityHistory.reason,
          },
        ])

        const seededHistory: ContactInboxIdentityHistoryEntry[] = Array.from(
          { length: CONTACT_INBOX_IDENTITY_HISTORY_LIMIT },
          (_, index) => ({
            sourceId: `seed-source-${index}`,
            sourceUserId: `seed-user-${index}`,
            sourceParentUserId: `seed-parent-${index}`,
            changedAt: new Date(
              Date.UTC(2026, 8, 28, 2, 0, index),
            ).toISOString(),
            reason: "userIdChanged",
          }),
        )
        await observerDb
          .update(schema.contactInboxModel)
          .set({ sourceIdentityHistory: seededHistory })
          .where(eq(schema.contactInboxModel.id, contactInbox.id))

        const capped = await contactInboxRepository.updateIdentityGuarded(
          {
            id: contactInbox.id,
            guard: { sourceParentUserId: ORIGINAL_IDENTITY.sourceParentUserId },
            set: { sourceParentUserId: "parent-after-cap" },
            appendIdentityHistory: {
              changedAt: "2026-09-28T02:00:10.000Z",
              reason: "parentFallback",
            },
          },
          observerDb,
        )

        expect(capped?.sourceIdentityHistory).toHaveLength(
          CONTACT_INBOX_IDENTITY_HISTORY_LIMIT,
        )
        expect(capped?.sourceIdentityHistory).toEqual([
          ...seededHistory.slice(1),
          {
            sourceId: "phone-after-b",
            sourceUserId: "user-after-a",
            sourceParentUserId: ORIGINAL_IDENTITY.sourceParentUserId,
            changedAt: "2026-09-28T02:00:10.000Z",
            reason: "parentFallback",
          },
        ])
      } finally {
        releaseTransactionA.resolve()
        await Promise.allSettled(
          [transactionAPromise, transactionBPromise].filter(
            (promise): promise is Promise<void> => promise !== undefined,
          ),
        )
        await cleanupFixture()
      }
    }, 15_000)
  },
)
