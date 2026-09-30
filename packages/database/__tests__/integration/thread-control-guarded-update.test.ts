// @vitest-environment node

/**
 * `contactInboxRepository.applyThreadControlTransition` (and the inbox
 * throttle / archive-release read) against a real Postgres. The unit test
 * mocks the query chain, so the guard's SQL - timestamp order, the same-second
 * tie rule, workspace scoping - only proves itself here.
 *
 * Every test seeds its own fixture inside a transaction that is always rolled
 * back, so nothing is left behind in the database.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import {
  THREAD_CONTROL_EVENT_PRECEDENCE,
  THREAD_CONTROL_SEEN_REFRESH_MS,
  type ThreadControlEvent,
  type ThreadControlRole,
} from "../../src/partials/thread-control"
import { relations } from "../../src/relations"
import { contactInboxRepository } from "../../src/repositories/contact-inbox/repository"
import { inboxRepository } from "../../src/repositories/inbox/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const T0 = new Date("2026-09-29T10:00:00.000Z")
const at = (offsetSeconds: number): Date =>
  new Date(T0.getTime() + offsetSeconds * 1000)

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

type Fixture = {
  workspaceId: string
  otherWorkspaceId: string
  inboxId: string
  contactId: string
  contactInboxId: string
}

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `tc-${label}-${Date.now()}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `tc-${label}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return workspace.id
}

const seedFixture = async (tx: DatabaseClient): Promise<Fixture> => {
  const workspaceId = await seedWorkspace(tx, "a")
  const otherWorkspaceId = await seedWorkspace(tx, "b")
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({ workspaceId })
    .returning({ id: schema.contactModel.id })
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      name: "tc-inbox",
      channel: "whatsapp",
      sourceId: "tc-phone",
      workspaceId,
    })
    .returning({ id: schema.inboxModel.id })
  const [contactInbox] = await tx
    .insert(schema.contactInboxModel)
    .values({
      originalContactId: contact.id,
      contactId: contact.id,
      inboxId: inbox.id,
      channel: "whatsapp",
      source: "whatsapp",
      sourceId: "tc-wa-id",
    })
    .returning({ id: schema.contactInboxModel.id })
  return {
    workspaceId,
    otherWorkspaceId,
    inboxId: inbox.id,
    contactId: contact.id,
    contactInboxId: contactInbox.id,
  }
}

const apply = (
  tx: DatabaseClient,
  fixture: Fixture,
  event: ThreadControlEvent,
  occurredAt: Date,
  ownerRole: ThreadControlRole | null = null,
) =>
  contactInboxRepository.applyThreadControlTransition(
    {
      id: fixture.contactInboxId,
      workspaceId: fixture.workspaceId,
      event,
      ownerRole,
      occurredAt,
    },
    tx,
  )

/** Back to a never-observed thread, so each tie scenario starts from scratch. */
const resetThread = async (tx: DatabaseClient, fixture: Fixture) => {
  await tx
    .update(schema.contactInboxModel)
    .set({
      threadControlState: null,
      threadOwnerRole: null,
      threadControlUpdatedAt: null,
      threadControlLastEvent: null,
    })
    .where(eq(schema.contactInboxModel.id, fixture.contactInboxId))
}

const readRow = async (tx: DatabaseClient, fixture: Fixture) => {
  const row = await tx.query.contactInboxModel.findFirst({
    where: { id: fixture.contactInboxId },
    columns: {
      threadControlState: true,
      threadOwnerRole: true,
      threadControlUpdatedAt: true,
      threadControlLastEvent: true,
    },
  })
  return row
}

describe.skipIf(!databaseUrl)(
  "contactInboxRepository.applyThreadControlTransition against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const run = (fn: (tx: DatabaseClient, fixture: Fixture) => Promise<void>) =>
      withRolledBackTransaction(createDatabase(client), async (tx) => {
        await fn(tx, await seedFixture(tx))
      })

    test("a fresh row accepts the first event and records state, role, time and event", () =>
      run(async (tx, fixture) => {
        const row = await apply(tx, fixture, "standbyReceived", T0, "ai_agent")

        expect(row).toMatchObject({
          threadControlState: "standby",
          threadOwnerRole: "ai_agent",
          threadControlLastEvent: "standbyReceived",
        })
        expect(row?.threadControlUpdatedAt?.getTime()).toBe(T0.getTime())
      }))

    test("a stale event (older timestamp) is rejected and leaves the row untouched", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "controlTaken", at(10), "ai_agent")

        const stale = await apply(tx, fixture, "inboundReceived", at(5))

        expect(stale).toBeNull()
        expect(await readRow(tx, fixture)).toMatchObject({
          threadControlState: "standby",
          threadOwnerRole: "ai_agent",
          threadControlLastEvent: "controlTaken",
        })
      }))

    test("a same-state event advances the timestamp so an older transition stays stale", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "standbyReceived", at(1), "ai_agent")
        // No state change, but it must move the clock forward.
        const noOp = await apply(
          tx,
          fixture,
          "standbyReceived",
          at(20),
          "ai_agent",
        )
        expect(noOp?.threadControlUpdatedAt?.getTime()).toBe(at(20).getTime())

        const older = await apply(tx, fixture, "inboundReceived", at(10))

        expect(older).toBeNull()
        expect((await readRow(tx, fixture))?.threadControlState).toBe("standby")
      }))

    test("an exact redelivery on the same second is accepted as idempotent", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "controlPassed", T0, "customer_service")

        const again = await apply(
          tx,
          fixture,
          "controlPassed",
          T0,
          "customer_service",
        )

        expect(again).not.toBeNull()
      }))

    test("same second, same event and state but a different role is rejected as stale", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "controlPassed", T0, "customer_service")

        const roleOnly = await apply(
          tx,
          fixture,
          "controlPassed",
          T0,
          "escalation",
        )

        expect(roleOnly).toBeNull()
        expect((await readRow(tx, fixture))?.threadOwnerRole).toBe(
          "customer_service",
        )
      }))

    test("same-second ties resolve by precedence regardless of processing order", () =>
      run(async (tx, fixture) => {
        const events = THREAD_CONTROL_EVENT_PRECEDENCE
        for (let low = 0; low < events.length; low++) {
          for (let high = low + 1; high < events.length; high++) {
            const orders: [ThreadControlEvent, ThreadControlEvent][] = [
              [events[low], events[high]],
              [events[high], events[low]],
            ]
            const finals: (string | null | undefined)[] = []
            for (const [first, second] of orders) {
              await resetThread(tx, fixture)
              const base = at(100)
              await apply(tx, fixture, first, base)
              await apply(tx, fixture, second, base)
              finals.push((await readRow(tx, fixture))?.threadControlLastEvent)
            }
            expect(finals[0]).toBe(events[high])
            expect(finals[1]).toBe(events[high])
          }
        }
      }))

    test("an owner copy promoted from its standby copy is recorded one tick later and wins", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "standbyReceived", T0, "ai_agent")

        // Same Meta second: standbyReceived outranks inboundReceived.
        const sameSecond = await apply(tx, fixture, "inboundReceived", T0)
        const promoted = await apply(tx, fixture, "inboundReceived", at(1))

        expect(sameSecond).toBeNull()
        expect(promoted).toMatchObject({
          threadControlState: "owned",
          threadOwnerRole: null,
        })
      }))

    test("a contact inbox of another workspace is never updated", () =>
      run(async (tx, fixture) => {
        const foreign =
          await contactInboxRepository.applyThreadControlTransition(
            {
              id: fixture.contactInboxId,
              workspaceId: fixture.otherWorkspaceId,
              event: "inboundReceived",
              ownerRole: null,
              occurredAt: T0,
            },
            tx,
          )

        expect(foreign).toBeNull()
        expect((await readRow(tx, fixture))?.threadControlState).toBeNull()
      }))

    test("listThreadControlledByContactIds returns only owned rows of the workspace", () =>
      run(async (tx, fixture) => {
        await apply(tx, fixture, "inboundReceived", T0)

        const owned =
          await contactInboxRepository.listThreadControlledByContactIds(
            {
              workspaceId: fixture.workspaceId,
              contactIds: [fixture.contactId],
            },
            tx,
          )
        const foreign =
          await contactInboxRepository.listThreadControlledByContactIds(
            {
              workspaceId: fixture.otherWorkspaceId,
              contactIds: [fixture.contactId],
            },
            tx,
          )
        await apply(tx, fixture, "controlTaken", at(5), "ai_agent")
        const afterStandby =
          await contactInboxRepository.listThreadControlledByContactIds(
            {
              workspaceId: fixture.workspaceId,
              contactIds: [fixture.contactId],
            },
            tx,
          )

        expect(owned.map((row) => row.id)).toEqual([fixture.contactInboxId])
        expect(foreign).toEqual([])
        expect(afterStandby).toEqual([])
      }))

    test("touchThreadControlSeen writes once, then is throttled for the refresh interval", () =>
      run(async (tx, fixture) => {
        const input = {
          workspaceId: fixture.workspaceId,
          inboxId: fixture.inboxId,
        }

        const first = await inboxRepository.touchThreadControlSeen(
          { ...input, seenAt: T0 },
          tx,
        )
        const throttled = await inboxRepository.touchThreadControlSeen(
          { ...input, seenAt: at(60) },
          tx,
        )
        const refreshed = await inboxRepository.touchThreadControlSeen(
          {
            ...input,
            seenAt: new Date(
              T0.getTime() + THREAD_CONTROL_SEEN_REFRESH_MS + 1000,
            ),
          },
          tx,
        )
        const foreign = await inboxRepository.touchThreadControlSeen(
          {
            workspaceId: fixture.otherWorkspaceId,
            inboxId: fixture.inboxId,
            seenAt: T0,
          },
          tx,
        )

        expect([first, throttled, refreshed, foreign]).toEqual([
          true,
          false,
          true,
          false,
        ])
      }))
  },
)
