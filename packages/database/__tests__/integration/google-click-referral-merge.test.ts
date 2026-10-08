// @vitest-environment node

/**
 * `newestGoogleClickReferralMerge` against a real Postgres: the stored
 * `referral->>'googleClickReceivedAt'` decides, inside one UPDATE, whether the
 * six Google keys of an incoming referral apply. The unit test only proves the
 * SQL text; ordering, the strict `>` tie rule and the jsonb merge prove here.
 *
 * Every test seeds its own fixture inside a transaction that is always rolled
 * back. Skipped unless `DATABASE_URL` points at a reachable database; run it
 * with `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { newestGoogleClickReferralMerge } from "../../src/queries/google-click"
import { relations } from "../../src/relations"
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

const CLICK_A = {
  gclid: "gclid-A-1234567890",
  gbraid: null,
  googleCampaignId: "1",
  googleAdGroupId: "2",
  googleAdId: "3",
  googleClickReceivedAt: "2026-10-01T10:00:00.000Z",
}
const CLICK_B = {
  gclid: null,
  gbraid: "gbraid-B-1234567890",
  googleCampaignId: "10",
  googleAdGroupId: "20",
  googleAdId: "30",
  googleClickReceivedAt: "2026-10-01T11:00:00.000Z",
}

const seedReferral = (
  tx: DatabaseClient,
  fixture: Fixture,
  referral: Record<string, unknown> | null,
) =>
  tx
    .update(schema.contactInboxModel)
    .set({ referral })
    .where(eq(schema.contactInboxModel.id, fixture.contactInboxId))

const merge = async (
  tx: DatabaseClient,
  fixture: Fixture,
  incoming: Record<string, unknown>,
) => {
  const next = newestGoogleClickReferralMerge(incoming)
  if (!next) {
    throw new Error("expected a guarded merge")
  }
  await tx
    .update(schema.contactInboxModel)
    .set({ referral: next })
    .where(eq(schema.contactInboxModel.id, fixture.contactInboxId))
  const row = await tx.query.contactInboxModel.findFirst({
    where: { id: fixture.contactInboxId },
    columns: { referral: true },
  })
  return row?.referral as Record<string, unknown>
}

describe.skipIf(!databaseUrl)(
  "newestGoogleClickReferralMerge against Postgres",
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

    test("delivery order B then A keeps the newer click B", () =>
      run(async (tx, fixture) => {
        await merge(tx, fixture, CLICK_B)
        const referral = await merge(tx, fixture, CLICK_A)
        expect(referral).toMatchObject(CLICK_B)
      }))

    test("delivery order A then B lets the newer click B win and clears gclid", () =>
      run(async (tx, fixture) => {
        await merge(tx, fixture, CLICK_A)
        const referral = await merge(tx, fixture, CLICK_B)
        expect(referral).toMatchObject(CLICK_B)
        expect(referral.gclid).toBeNull()
      }))

    test("the same timestamp applies the incoming click", () =>
      run(async (tx, fixture) => {
        await merge(tx, fixture, CLICK_A)
        const same = {
          ...CLICK_B,
          googleClickReceivedAt: CLICK_A.googleClickReceivedAt,
        }
        expect(await merge(tx, fixture, same)).toMatchObject(same)
      }))

    test("no stored click, or a null referral, applies the incoming click", () =>
      run(async (tx, fixture) => {
        await seedReferral(tx, fixture, { ctwaClid: "meta-1" })
        expect(await merge(tx, fixture, CLICK_A)).toMatchObject({
          ...CLICK_A,
          ctwaClid: "meta-1",
        })
        await seedReferral(tx, fixture, null)
        expect(await merge(tx, fixture, CLICK_A)).toMatchObject(CLICK_A)
      }))

    test("a stale click still merges its non-Google keys", () =>
      run(async (tx, fixture) => {
        await merge(tx, fixture, CLICK_B)
        const referral = await merge(tx, fixture, {
          ...CLICK_A,
          ctwaClid: "meta-2",
        })
        expect(referral).toMatchObject({ ...CLICK_B, ctwaClid: "meta-2" })
      }))

    test("a non-ISO garbage stored timestamp is treated as absent and overwritten", () =>
      run(async (tx, fixture) => {
        await seedReferral(tx, fixture, { googleClickReceivedAt: "garbage" })
        expect(await merge(tx, fixture, CLICK_A)).toMatchObject(CLICK_A)
      }))

    test("an ISO-shaped but impossible stored timestamp never throws", () =>
      run(async (tx, fixture) => {
        // Passes the strict regex, so it is compared as TEXT (harmless:
        // '2026-99-...' sorts after real 2026 months, so an older-looking
        // incoming click is dropped, while a newer year still applies).
        await seedReferral(tx, fixture, {
          googleClickReceivedAt: "2026-99-99T00:00:00.000Z",
        })
        await expect(merge(tx, fixture, CLICK_A)).resolves.toBeDefined()
      }))

    test("an ISO-shaped garbage value that is not fixed-width is treated as absent", () =>
      run(async (tx, fixture) => {
        await seedReferral(tx, fixture, {
          googleClickReceivedAt: "2026-99-99Tgarbage",
        })
        expect(await merge(tx, fixture, CLICK_A)).toMatchObject(CLICK_A)
      }))

    test("a reversed order (older incoming after newer stored) keeps the stored click", () =>
      run(async (tx, fixture) => {
        await seedReferral(tx, fixture, CLICK_B)
        expect(await merge(tx, fixture, CLICK_A)).toMatchObject(CLICK_B)
      }))
  },
)
