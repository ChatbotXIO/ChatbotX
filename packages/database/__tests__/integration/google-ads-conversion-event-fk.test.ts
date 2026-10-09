// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

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

/** Seeds a workspace with a connected satellite, a contact inbox and one linked event. */
const seedLinkedEvent = async (tx: DatabaseClient) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `google-ads-fk-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `google-ads-fk-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      channel: "instagram",
      name: `Instagram ${suffix}`,
      sourceId: `instagram-${suffix}`,
      workspaceId: workspace.id,
    })
    .returning({ id: schema.inboxModel.id })
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({ workspaceId: workspace.id })
    .returning({ id: schema.contactModel.id })
  const [contactInbox] = await tx
    .insert(schema.contactInboxModel)
    .values({
      channel: "instagram",
      contactId: contact.id,
      inboxId: inbox.id,
      originalContactId: contact.id,
      source: "instagram",
      sourceId: `contact-${suffix}`,
    })
    .returning({ id: schema.contactInboxModel.id })
  const [integration] = await tx
    .insert(schema.integrationModel)
    .values({ workspaceId: workspace.id, integrationType: "googleAds" })
    .returning({ id: schema.integrationModel.id })
  const [satellite] = await tx
    .insert(schema.integrationGoogleAdsModel)
    .values({
      workspaceId: workspace.id,
      integrationId: integration.id,
      auth: {},
      customerId: "1234567890",
    })
    .returning({ id: schema.integrationGoogleAdsModel.id })
  const [event] = await tx
    .insert(schema.googleAdsConversionEventModel)
    .values({
      workspaceId: workspace.id,
      integrationGoogleAdsId: satellite.id,
      contactInboxId: contactInbox.id,
      customerId: "1234567890",
      conversionCustomerId: "1234567890",
      conversionActionId: "111",
      conversionActionCategory: "QUALIFIED_LEAD",
      channel: "instagram",
      source: "flowStep",
      scopeId: "step-1",
      clickIdType: "gclid",
      clickId: "ABCDEFGHIJKLMNOP",
      googleClickReceivedAt: new Date("2026-10-01T00:00:00Z"),
      occurredAt: new Date("2026-10-01T01:00:00Z"),
      transactionId: `gads-fk-${suffix}`,
      uploadMethod: "dataManager",
      status: "pending",
      attempt: 0,
      processingAttempts: 0,
    })
    .returning({ id: schema.googleAdsConversionEventModel.id })
  return {
    eventId: event.id,
    contactInboxId: contactInbox.id,
    satelliteId: satellite.id,
  }
}

const readEvent = async (tx: DatabaseClient, eventId: string) => {
  const [row] = await tx
    .select({
      id: schema.googleAdsConversionEventModel.id,
      contactInboxId: schema.googleAdsConversionEventModel.contactInboxId,
      integrationGoogleAdsId:
        schema.googleAdsConversionEventModel.integrationGoogleAdsId,
    })
    .from(schema.googleAdsConversionEventModel)
    .where(eq(schema.googleAdsConversionEventModel.id, eventId))
  return row
}

describe.skipIf(!databaseUrl)("GoogleAdsConversionEvent foreign keys", () => {
  let client: Client
  let db: DatabaseClient

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
    db = drizzle({ client, schema, relations })
  })

  afterAll(async () => {
    await client.end()
  })

  test("deleting the ContactInbox nulls contactInboxId and keeps the event", () =>
    withRolledBackTransaction(db, async (tx) => {
      const { eventId, contactInboxId, satelliteId } = await seedLinkedEvent(tx)

      await tx
        .delete(schema.contactInboxModel)
        .where(eq(schema.contactInboxModel.id, contactInboxId))

      const row = await readEvent(tx, eventId)
      expect(row).toBeDefined()
      expect(row?.contactInboxId).toBeNull()
      expect(row?.integrationGoogleAdsId).toBe(satelliteId)
    }))

  test("deleting the IntegrationGoogleAds row nulls integrationGoogleAdsId and keeps the event", () =>
    withRolledBackTransaction(db, async (tx) => {
      const { eventId, contactInboxId, satelliteId } = await seedLinkedEvent(tx)

      await tx
        .delete(schema.integrationGoogleAdsModel)
        .where(eq(schema.integrationGoogleAdsModel.id, satelliteId))

      const row = await readEvent(tx, eventId)
      expect(row).toBeDefined()
      expect(row?.integrationGoogleAdsId).toBeNull()
      expect(row?.contactInboxId).toBe(contactInboxId)
    }))
})
