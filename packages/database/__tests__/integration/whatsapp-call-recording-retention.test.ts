// @vitest-environment node

/**
 * `listRecordingsPastRetention` against a real Postgres. The unit test mocks
 * the query chain, so the rendered SQL never reaches the server; this proves
 * the server accepts it and that the per-inbox cutoff selects the right rows.
 *
 * The cutoff is `$now - <per-row interval>`. An untyped `$now` parameter makes
 * Postgres resolve it as an interval, which then cannot be compared with
 * `recordedAt` (SQLSTATE 42883) - the failure this suite pins.
 *
 * Every test seeds its own fixture inside a transaction that is always rolled
 * back, so nothing is left behind in the database.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { whatsappCallRepository } from "../../src/repositories/whatsapp-call/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const NOW = new Date("2026-09-24T05:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS)

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

/**
 * Runs `fn` inside a transaction and rolls it back afterwards, whatever the
 * outcome. `fn`'s own failures are re-thrown so assertions still surface.
 */
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

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

type SeededInbox = { inboxId: string; contactInboxId: string }

const seedInbox = async (
  tx: DatabaseClient,
  props: {
    workspaceId: string
    contactId: string
    retentionDays: number
  },
): Promise<SeededInbox> => {
  const name = `retention-${props.retentionDays}d`
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      name,
      channel: "whatsapp",
      sourceId: `phone-${props.retentionDays}`,
      workspaceId: props.workspaceId,
    })
    .returning({ id: schema.inboxModel.id })
  await tx.insert(schema.integrationWhatsappModel).values({
    auth: {},
    phoneNumberId: `phone-${props.retentionDays}`,
    wabaId: "waba",
    businessId: "business",
    name,
    workspaceId: props.workspaceId,
    inboxId: inbox.id,
    callRecordingRetentionDays: props.retentionDays,
  })
  const [contactInbox] = await tx
    .insert(schema.contactInboxModel)
    .values({
      originalContactId: props.contactId,
      contactId: props.contactId,
      inboxId: inbox.id,
      channel: "whatsapp",
      source: "whatsapp",
      sourceId: `wa-${props.retentionDays}`,
    })
    .returning({ id: schema.contactInboxModel.id })
  return { inboxId: inbox.id, contactInboxId: contactInbox.id }
}

const seedCall = async (
  tx: DatabaseClient,
  props: {
    workspaceId: string
    conversationId: string
    inbox: SeededInbox
    recordedDaysAgo: number
    recordingPurged?: boolean
  },
): Promise<string> => {
  const [call] = await tx
    .insert(schema.whatsappCallModel)
    .values({
      direction: "userInitiated",
      status: "completed",
      workspaceId: props.workspaceId,
      inboxId: props.inbox.inboxId,
      contactInboxId: props.inbox.contactInboxId,
      conversationId: props.conversationId,
      recordingPath: props.recordingPurged ? null : "space/calls/rec.ogg",
      recordedAt: props.recordingPurged ? null : daysAgo(props.recordedDaysAgo),
    })
    .returning({ id: schema.whatsappCallModel.id })
  return call.id
}

/**
 * Two inboxes with different retention windows and one recording on each side
 * of every cutoff, plus one already-purged row that must never come back.
 */
const seedRetentionFixture = async (tx: DatabaseClient) => {
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `retention-${Date.now()}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: "retention", ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({ workspaceId: workspace.id })
    .returning({ id: schema.contactModel.id })
  const [conversation] = await tx
    .insert(schema.conversationModel)
    .values({ workspaceId: workspace.id, contactId: contact.id })
    .returning({ id: schema.conversationModel.id })

  const shortRetention = await seedInbox(tx, {
    workspaceId: workspace.id,
    contactId: contact.id,
    retentionDays: 30,
  })
  const longRetention = await seedInbox(tx, {
    workspaceId: workspace.id,
    contactId: contact.id,
    retentionDays: 90,
  })

  const call = (
    inbox: SeededInbox,
    recordedDaysAgo: number,
    recordingPurged = false,
  ) =>
    seedCall(tx, {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      inbox,
      recordedDaysAgo,
      recordingPurged,
    })

  return {
    workspaceId: workspace.id,
    expired: [await call(shortRetention, 45), await call(longRetention, 100)],
    kept: [
      await call(shortRetention, 10),
      await call(longRetention, 45),
      await call(longRetention, 100, true),
    ],
  }
}

describe.skipIf(!databaseUrl)(
  "whatsappCallRepository.listRecordingsPastRetention against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    test("returns recordings past their own inbox's retention and keeps the rest", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        const fixture = await seedRetentionFixture(tx)

        const rows = await whatsappCallRepository.listRecordingsPastRetention(
          { limit: 100, now: NOW },
          tx,
        )

        const returned = rows
          .filter((row) => row.workspaceId === fixture.workspaceId)
          .map((row) => row.id)
        expect(returned.sort()).toEqual(fixture.expired.sort())
        expect(returned).not.toEqual(expect.arrayContaining(fixture.kept))
      })
    })

    test("bounds a page by limit", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        await seedRetentionFixture(tx)

        const rows = await whatsappCallRepository.listRecordingsPastRetention(
          { limit: 1, now: NOW },
          tx,
        )

        expect(rows).toHaveLength(1)
      })
    })
  },
)
