// @vitest-environment node

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { googleAdsConversionEventRepository } from "../../src/repositories/google-ads-conversion-event/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const UNIQUE_VIOLATION = "23505"
const WORKSPACE_UNIQUE_INDEX = "IntegrationGoogleAds_workspaceId_key"

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

const seedWorkspace = async (tx: DatabaseClient) => {
  const suffix = `${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `google-ads-event-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `google-ads-event-${suffix}`, ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  return workspace.id
}

const eventOptions = {
  version: 1 as const,
  identity: {
    version: 1 as const,
    configuredPolicy: "click" as const,
    effectivePolicy: "click" as const,
    keySource: "click" as const,
    id: null,
  },
  timeSource: "recorded" as const,
  consent: {
    adUserData: { status: null, source: "notProvided" as const },
    adPersonalization: { status: null, source: "notProvided" as const },
  },
}

const eventValues = (workspaceId: string, transactionId: string) => ({
  workspaceId,
  customerId: "1234567890",
  conversionCustomerId: "1234567890",
  conversionActionId: "111",
  conversionActionCategory: "QUALIFIED_LEAD",
  channel: "whatsapp" as const,
  source: "flowStep" as const,
  scopeId: "step-1",
  clickIdType: "gclid" as const,
  clickId: "ABCDEFGHIJKLMNOP",
  googleClickReceivedAt: new Date("2026-10-01T00:00:00Z"),
  occurredAt: new Date("2026-10-01T01:00:00Z"),
  transactionId,
  options: eventOptions,
  uploadMethod: "dataManager" as const,
  status: "pending" as const,
  attempt: 0,
  processingAttempts: 0,
})

describe.skipIf(!databaseUrl)("GoogleAdsConversionEvent", () => {
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

  test("a duplicate transactionId in a workspace is ignored", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const values = eventValues(workspaceId, "gads-1")

      const first =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          values,
          tx,
        )
      const second =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          values,
          tx,
        )

      expect(first).not.toBeNull()
      expect(second).toBeNull()
    }))

  test("occurredAt may precede the click receipt (no CHECK; receipt is a proxy)", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const occurredAt = new Date("2026-09-01T00:00:00Z")

      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          { ...eventValues(workspaceId, "gads-backdated"), occurredAt },
          tx,
        )

      expect(event?.occurredAt).toEqual(occurredAt)
    }))

  test("the options snapshot is stored verbatim and the first one wins on a duplicate", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const values = eventValues(workspaceId, "gads-options")
      const later = {
        ...eventOptions,
        timeSource: "provided" as const,
      }

      const first =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          values,
          tx,
        )
      await googleAdsConversionEventRepository.insertIgnoreDuplicate(
        { ...values, options: later },
        tx,
      )
      const stored =
        await googleAdsConversionEventRepository.findByTransactionId(
          { workspaceId, transactionId: "gads-options" },
          tx,
        )

      expect(first?.options).toEqual(eventOptions)
      expect(stored?.options).toEqual(eventOptions)
    }))

  test("the channel column is plain text, so a new channel needs no migration", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          { ...eventValues(workspaceId, "gads-channel"), channel: "zalo" },
          tx,
        )

      expect(event?.channel).toBe("zalo")
    }))

  test("claim, then a stale generation cannot claim, and a rotated token cannot finish", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          eventValues(workspaceId, "gads-2"),
          tx,
        )
      const ref = { id: event?.id ?? "", workspaceId }

      const claimed = await googleAdsConversionEventRepository.claimForSending(
        { ...ref, attempt: 0, claimToken: "a" },
        tx,
      )
      const secondClaim =
        await googleAdsConversionEventRepository.claimForSending(
          { ...ref, attempt: 0, claimToken: "b" },
          tx,
        )
      await googleAdsConversionEventRepository.redrive(
        { ...ref, fromStatuses: ["sending"], expectedAttempt: 0 },
        tx,
      )
      const lateFinish = await googleAdsConversionEventRepository.finishSending(
        {
          ...ref,
          claimToken: "a",
          to: "sent",
          requestId: "r",
          sentAt: new Date(),
        },
        tx,
      )

      expect(claimed?.status).toBe("sending")
      expect(secondClaim).toBeNull()
      expect(lateFinish).toBeNull()
    }))

  describe("legacy direct completion (C6)", () => {
    const seedClaimed = async (
      tx: DatabaseClient,
      transactionId: string,
      overrides: Record<string, unknown> = {},
    ) => {
      const workspaceId = await seedWorkspace(tx)
      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          {
            ...eventValues(workspaceId, transactionId),
            uploadMethod: "legacy",
            ...overrides,
          },
          tx,
        )
      const ref = { id: event?.id ?? "", workspaceId }
      await googleAdsConversionEventRepository.claimForSending(
        { ...ref, attempt: 0, claimToken: "tok" },
        tx,
      )
      return ref
    }

    const completion = (ref: { id: string; workspaceId: string }) => ({
      ...ref,
      claimToken: "tok",
      attempt: 0,
      requestId: "legacy:42",
      sentAt: new Date("2026-10-07T00:00:00Z"),
      processingDetail: {
        requestStatus: "LEGACY_UPLOAD_COMPLETED",
        recordCount: 1,
        errorCounts: [],
        warningCounts: [],
      },
    })

    test("moves sending -> processed in one statement and satisfies the CHECKs", () =>
      withRolledBackTransaction(db, async (tx) => {
        const ref = await seedClaimed(tx, "gads-fsp-1")

        const done =
          await googleAdsConversionEventRepository.finishSendingProcessed(
            completion(ref),
            tx,
          )

        expect(done).toMatchObject({
          status: "processed",
          processingStatus: "success",
          requestId: "legacy:42",
          processingAttempts: 1,
          claimToken: null,
          claimedAt: null,
          error: null,
          failureStage: null,
          nextProcessingCheckAt: null,
        })
        expect(done?.sentAt).toBeInstanceOf(Date)
        expect(done?.processingCheckedAt).toBeInstanceOf(Date)
      }))

    test("a rotated claim token or a newer generation writes nothing", () =>
      withRolledBackTransaction(db, async (tx) => {
        const ref = await seedClaimed(tx, "gads-fsp-2")

        const wrongToken =
          await googleAdsConversionEventRepository.finishSendingProcessed(
            { ...completion(ref), claimToken: "other" },
            tx,
          )
        const wrongGeneration =
          await googleAdsConversionEventRepository.finishSendingProcessed(
            { ...completion(ref), attempt: 1 },
            tx,
          )
        const row = await googleAdsConversionEventRepository.findWorkspaceEvent(
          ref,
          tx,
        )

        expect(wrongToken).toBeNull()
        expect(wrongGeneration).toBeNull()
        expect(row?.status).toBe("sending")
      }))

    test("a stale worker cannot complete after the sweeper redrove the row", () =>
      withRolledBackTransaction(db, async (tx) => {
        const ref = await seedClaimed(tx, "gads-fsp-3")
        await googleAdsConversionEventRepository.redrive(
          { ...ref, fromStatuses: ["sending"], expectedAttempt: 0 },
          tx,
        )

        const late =
          await googleAdsConversionEventRepository.finishSendingProcessed(
            completion(ref),
            tx,
          )

        expect(late).toBeNull()
      }))

    test("a row that is not sending cannot be completed", () =>
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const event =
          await googleAdsConversionEventRepository.insertIgnoreDuplicate(
            {
              ...eventValues(workspaceId, "gads-fsp-4"),
              uploadMethod: "legacy",
            },
            tx,
          )

        const done =
          await googleAdsConversionEventRepository.finishSendingProcessed(
            completion({ id: event?.id ?? "", workspaceId }),
            tx,
          )

        expect(done).toBeNull()
      }))

    test("markSendAttempted is lease-fenced, first stamp wins, and survives a redrive", () =>
      withRolledBackTransaction(db, async (tx) => {
        const ref = await seedClaimed(tx, "gads-stamp-1")
        const first = new Date("2026-10-06T00:00:00Z")

        const stranger =
          await googleAdsConversionEventRepository.markSendAttempted(
            { ...ref, claimToken: "other", attempt: 0, at: first },
            tx,
          )
        const stamped =
          await googleAdsConversionEventRepository.markSendAttempted(
            { ...ref, claimToken: "tok", attempt: 0, at: first },
            tx,
          )
        const again =
          await googleAdsConversionEventRepository.markSendAttempted(
            {
              ...ref,
              claimToken: "tok",
              attempt: 0,
              at: new Date("2026-10-07T00:00:00Z"),
            },
            tx,
          )
        const redriven = await googleAdsConversionEventRepository.redrive(
          { ...ref, fromStatuses: ["sending"], expectedAttempt: 0 },
          tx,
        )

        expect(stranger).toBeNull()
        expect(stamped?.processingDetail?.sendAttemptedAt).toBe(
          first.toISOString(),
        )
        expect(again?.processingDetail?.sendAttemptedAt).toBe(
          first.toISOString(),
        )
        expect(redriven?.processingDetail).toEqual({
          sendAttemptedAt: first.toISOString(),
        })
      }))

    test("a redrive of an unstamped row clears the detail as before", () =>
      withRolledBackTransaction(db, async (tx) => {
        const ref = await seedClaimed(tx, "gads-stamp-2")

        const redriven = await googleAdsConversionEventRepository.redrive(
          { ...ref, fromStatuses: ["sending"], expectedAttempt: 0 },
          tx,
        )

        expect(redriven?.processingDetail).toBeNull()
      }))

    test("the poll query never returns a legacy row", () =>
      withRolledBackTransaction(db, async (tx) => {
        const due = new Date("2026-10-07T00:00:00Z")
        for (const method of ["dataManager", "legacy"] as const) {
          const workspaceId = await seedWorkspace(tx)
          await tx.insert(schema.googleAdsConversionEventModel).values({
            ...eventValues(workspaceId, `gads-poll-${method}`),
            uploadMethod: method,
            status: "sent",
            requestId: "r",
            sentAt: due,
            processingStatus: "processing",
            nextProcessingCheckAt: due,
          })
        }

        const rows =
          await googleAdsConversionEventRepository.listDueForProcessingCheck(
            { now: new Date("2026-10-08T00:00:00Z"), limit: 1000 },
            tx,
          )

        const methods = rows.map((row) => row.uploadMethod)
        expect(methods).not.toContain("legacy")
        expect(methods).toContain("dataManager")
      }))
  })

  test("CHECK constraints reject an impossible event", async () => {
    await expect(
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        await tx.insert(schema.googleAdsConversionEventModel).values({
          ...eventValues(workspaceId, "gads-3"),
          status: "sent",
        })
      }),
    ).rejects.toThrow()

    await expect(
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        await tx.insert(schema.googleAdsConversionEventModel).values({
          ...eventValues(workspaceId, "gads-4"),
          value: "10",
        })
      }),
    ).rejects.toThrow()
  })

  test.each([
    "dataManager",
    "legacy",
  ] as const)("stores uploadMethod %s as written", (uploadMethod) =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          {
            ...eventValues(workspaceId, `gads-um-${uploadMethod}`),
            uploadMethod,
          },
          tx,
        )

      expect(event?.uploadMethod).toBe(uploadMethod)
    }))

  test("uploadMethod has no database default, so an insert must write it", async () => {
    await expect(
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const { uploadMethod: _omitted, ...withoutMethod } = eventValues(
          workspaceId,
          "gads-um-missing",
        )
        await tx
          .insert(schema.googleAdsConversionEventModel)
          .values(withoutMethod as never)
      }),
    ).rejects.toThrow()
  })

  test("CHECK rejects an unknown uploadMethod", async () => {
    await expect(
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        await tx.insert(schema.googleAdsConversionEventModel).values({
          ...eventValues(workspaceId, "gads-um-bad"),
          uploadMethod: "soap" as never,
        })
      }),
    ).rejects.toThrow()
  })

  test("redrive leaves the pinned uploadMethod untouched", () =>
    withRolledBackTransaction(db, async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const event =
        await googleAdsConversionEventRepository.insertIgnoreDuplicate(
          {
            ...eventValues(workspaceId, "gads-um-redrive"),
            uploadMethod: "legacy",
          },
          tx,
        )
      const ref = { id: event?.id ?? "", workspaceId }
      await googleAdsConversionEventRepository.claimForSending(
        { ...ref, attempt: 0, claimToken: "a" },
        tx,
      )

      const redriven = await googleAdsConversionEventRepository.redrive(
        { ...ref, fromStatuses: ["sending"], expectedAttempt: 0 },
        tx,
      )

      expect(redriven?.uploadMethod).toBe("legacy")
    }))

  test.each([
    ["sending without a claim", { status: "sending" as const }],
    ["failureStage on a non-failed row", { failureStage: "delivery" as const }],
    [
      "processingStatus on a pending row",
      { processingStatus: "processing" as const },
    ],
    ["negative value", { value: "-1", currency: "USD" }],
    ["short click id", { clickId: "short" }],
    ["negative attempt", { attempt: -1 }],
  ])("CHECK rejects %s", async (_label, overrides) => {
    await expect(
      withRolledBackTransaction(db, async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        await tx.insert(schema.googleAdsConversionEventModel).values({
          ...eventValues(workspaceId, "gads-check"),
          ...overrides,
        })
      }),
    ).rejects.toThrow()
  })
})

describe.skipIf(!databaseUrl)("GoogleAdsConversionEvent concurrency", () => {
  test("concurrent inserts of one identity from separate connections leave one row", async () => {
    const connect = async () => {
      const client = new Client({ connectionString: databaseUrl ?? undefined })
      await client.connect()
      return { client, db: drizzle({ client, schema, relations }) }
    }
    const setup = await connect()
    const [owner] = await setup.db
      .insert(schema.userModel)
      .values({ email: `google-ads-race-${Date.now()}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await setup.db
      .insert(schema.workspaceModel)
      .values({ name: `google-ads-race-${Date.now()}`, ownerId: owner.id })
      .returning({ id: schema.workspaceModel.id })
    const racers = await Promise.all(Array.from({ length: 5 }, connect))
    try {
      const results = await Promise.all(
        racers.map(({ db }) =>
          googleAdsConversionEventRepository.insertIgnoreDuplicate(
            eventValues(workspace.id, "gads-v2-race"),
            db,
          ),
        ),
      )

      expect(results.filter((row) => row !== null)).toHaveLength(1)
    } finally {
      await Promise.all(racers.map(({ client }) => client.end()))
      // The workspace row cascades the event; the user is removed last.
      await setup.db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspace.id))
      await setup.db
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, owner.id))
      await setup.client.end()
    }
  })
})

describe.skipIf(!databaseUrl)("IntegrationGoogleAds", () => {
  test("one satellite per workspace (engine duplicateConstraint name)", async () => {
    const client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
    const db = drizzle({ client, schema, relations })
    try {
      await expect(
        withRolledBackTransaction(db, async (tx) => {
          const workspaceId = await seedWorkspace(tx)
          for (const customerId of ["1111111111", "2222222222"]) {
            const [integration] = await tx
              .insert(schema.integrationModel)
              .values({ workspaceId, integrationType: "googleAds" })
              .returning({ id: schema.integrationModel.id })
            await tx.insert(schema.integrationGoogleAdsModel).values({
              workspaceId,
              integrationId: integration.id,
              auth: {},
              customerId,
            })
          }
        }),
      ).rejects.toMatchObject({
        cause: { code: UNIQUE_VIOLATION, constraint: WORKSPACE_UNIQUE_INDEX },
      })
    } finally {
      await client.end()
    }
  })
})
