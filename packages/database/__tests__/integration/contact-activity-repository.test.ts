// @vitest-environment node

/**
 * Real-SQL checks for the contact activity repositories: idempotent upserts,
 * monotonic timestamps, workspace scoping, delete/purge, the purge fence and
 * partition pruning. Runs only against an explicitly configured local
 * database after the approved migrations have been applied.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { relations } from "../../src/relations"
import { contactActivityRepository } from "../../src/repositories/contact-activity/repository"
import { workspaceRepository } from "../../src/repositories/workspace/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const T_EARLY = new Date("2026-01-01T00:00:00.000Z")
const T_LATE = new Date("2026-01-02T00:00:00.000Z")

type Workspace = { contactIds: string[]; userId: string; workspaceId: string }

const flowActivity = (contactId: string, occurredAt: Date, referenceId = "5") =>
  ({
    activityType: "flowExecuted",
    contactId,
    occurredAt,
    parentReferenceId: "0",
    referenceId,
    referenceType: "flow",
  }) as const

const collectExecutedPartitions = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectExecutedPartitions)
  }
  const record = value as Record<string, unknown>
  const relation = record["Relation Name"]
  const loops = record["Actual Loops"]
  return [
    ...(typeof relation === "string" &&
    relation.startsWith("ContactActivity_p") &&
    typeof loops === "number" &&
    loops > 0
      ? [relation]
      : []),
    ...Object.values(record).flatMap(collectExecutedPartitions),
  ]
}

describe.skipIf(!databaseUrl)("contact activity repository", () => {
  let client: Client
  let own: Workspace
  let other: Workspace

  const database = () => drizzle({ client, relations, schema })

  const createWorkspace = async (label: string): Promise<Workspace> => {
    const db = database()
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `contact-activity-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `contact-activity-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const contacts = await db
      .insert(schema.contactModel)
      .values([{ workspaceId: workspace.id }, { workspaceId: workspace.id }])
      .returning({ id: schema.contactModel.id })

    return {
      contactIds: contacts.map((contact) => contact.id),
      userId: user.id,
      workspaceId: workspace.id,
    }
  }

  const cleanup = async (fixture: Workspace | undefined) => {
    if (!fixture) {
      return
    }
    const db = database()
    for (const table of [
      "ContactActivity",
      "ContactKeywordMessage",
      "ContactState",
    ]) {
      await client.query(`DELETE FROM "${table}" WHERE "workspaceId" = $1`, [
        fixture.workspaceId,
      ])
    }
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, fixture.workspaceId))
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, fixture.userId))
  }

  const activityRows = async (workspaceId: string) =>
    (
      await client.query<{
        contactId: string
        firstOccurredAt: Date
        referenceId: string
      }>(
        `SELECT "contactId", "referenceId", "firstOccurredAt" FROM "ContactActivity"
          WHERE "workspaceId" = $1 ORDER BY "contactId", "referenceId"`,
        [workspaceId],
      )
    ).rows

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    own = await createWorkspace("own")
    other = await createWorkspace("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  test("upsertActivities is idempotent and only moves the time earlier", async () => {
    const [contactId] = own.contactIds
    const upsert = (occurredAt: Date) =>
      contactActivityRepository.upsertActivities(
        {
          records: [flowActivity(contactId, occurredAt)],
          workspaceId: own.workspaceId,
        },
        database(),
      )

    await upsert(T_LATE)
    await upsert(T_LATE)
    expect(await activityRows(own.workspaceId)).toHaveLength(1)

    await upsert(T_EARLY)
    expect((await activityRows(own.workspaceId))[0]?.firstOccurredAt).toEqual(
      T_EARLY,
    )

    await upsert(T_LATE)
    expect((await activityRows(own.workspaceId))[0]?.firstOccurredAt).toEqual(
      T_EARLY,
    )
  })

  test("upsertActivities keeps references and contacts apart", async () => {
    const [first, second] = own.contactIds
    await contactActivityRepository.upsertActivities(
      {
        records: [
          flowActivity(first, T_EARLY, "5"),
          flowActivity(first, T_EARLY, "6"),
          flowActivity(second, T_EARLY, "5"),
        ],
        workspaceId: own.workspaceId,
      },
      database(),
    )

    expect(await activityRows(own.workspaceId)).toHaveLength(3)
  })

  test("upsertActivities never attaches a foreign workspace's contact", async () => {
    await contactActivityRepository.upsertActivities(
      {
        records: [flowActivity(other.contactIds[0], T_EARLY)],
        workspaceId: own.workspaceId,
      },
      database(),
    )

    expect(await activityRows(own.workspaceId)).toHaveLength(0)
    expect(await activityRows(other.workspaceId)).toHaveLength(0)
  })

  test("upsertActivities writes nothing for a deleted contact", async () => {
    const [contactId] = own.contactIds
    await database()
      .delete(schema.contactModel)
      .where(eq(schema.contactModel.id, contactId))

    await contactActivityRepository.upsertActivities(
      {
        records: [flowActivity(contactId, T_EARLY)],
        workspaceId: own.workspaceId,
      },
      database(),
    )

    expect(await activityRows(own.workspaceId)).toHaveLength(0)
  })

  test("accepts a flow node scoped to its parent flow", async () => {
    await contactActivityRepository.upsertActivities(
      {
        records: [
          {
            activityType: "flowNodeExecuted",
            contactId: own.contactIds[0],
            occurredAt: T_EARLY,
            parentReferenceId: "77",
            referenceId: "1778663027294",
            referenceType: "flowNode",
          },
        ],
        workspaceId: own.workspaceId,
      },
      database(),
    )

    expect(await activityRows(own.workspaceId)).toHaveLength(1)
  })

  test("the database rejects an unregistered type/reference pair", async () => {
    await expect(
      contactActivityRepository.upsertActivities(
        {
          records: [
            {
              activityType: "flowExecuted",
              contactId: own.contactIds[0],
              occurredAt: T_EARLY,
              parentReferenceId: "0",
              referenceId: "5",
              referenceType: "emailTopic",
            },
          ],
          workspaceId: own.workspaceId,
        },
        database(),
      ),
    ).rejects.toThrow()
  })

  test("insertKeywordMessage is idempotent by messageId and workspace scoped", async () => {
    const record = (contactId: string) => ({
      automatedResponseId: "7",
      contactId,
      messageId: "100",
      normalizedText: "xin chao",
      occurredAt: T_EARLY,
      text: "Xin Chào",
    })

    expect(
      await contactActivityRepository.insertKeywordMessage(
        { record: record(own.contactIds[0]), workspaceId: own.workspaceId },
        database(),
      ),
    ).toBe(true)
    expect(
      await contactActivityRepository.insertKeywordMessage(
        { record: record(own.contactIds[0]), workspaceId: own.workspaceId },
        database(),
      ),
    ).toBe(false)
    expect(
      await contactActivityRepository.insertKeywordMessage(
        { record: record(other.contactIds[0]), workspaceId: own.workspaceId },
        database(),
      ),
    ).toBe(false)

    const { rows } = await client.query(
      `SELECT 1 FROM "ContactKeywordMessage" WHERE "workspaceId" = $1`,
      [own.workspaceId],
    )
    expect(rows).toHaveLength(1)
  })

  test("upsertLastDelivered only moves forward", async () => {
    const [contactId] = own.contactIds
    const upsert = (deliveredAt: Date) =>
      contactActivityRepository.upsertLastDelivered(
        {
          records: [{ contactId, deliveredAt }],
          workspaceId: own.workspaceId,
        },
        database(),
      )
    const read = async () =>
      (
        await client.query<{ lastDeliveredAt: Date }>(
          `SELECT "lastDeliveredAt" FROM "ContactState" WHERE "workspaceId" = $1 AND "contactId" = $2`,
          [own.workspaceId, contactId],
        )
      ).rows[0]?.lastDeliveredAt

    await upsert(T_EARLY)
    expect(await read()).toEqual(T_EARLY)
    await upsert(T_LATE)
    expect(await read()).toEqual(T_LATE)
    expect(await upsert(T_EARLY)).toBe(0)
    expect(await read()).toEqual(T_LATE)
  })

  test("deleteByContactIds removes only the given contacts' rows", async () => {
    const [first, second] = own.contactIds
    await contactActivityRepository.upsertActivities(
      {
        records: [flowActivity(first, T_EARLY), flowActivity(second, T_EARLY)],
        workspaceId: own.workspaceId,
      },
      database(),
    )
    await contactActivityRepository.upsertLastDelivered(
      {
        records: [{ contactId: first, deliveredAt: T_EARLY }],
        workspaceId: own.workspaceId,
      },
      database(),
    )

    const deleted = await contactActivityRepository.deleteByContactIds(
      { contactIds: [first], workspaceId: own.workspaceId },
      database(),
    )

    expect(deleted).toBe(2)
    expect(
      (await activityRows(own.workspaceId)).map((row) => row.contactId),
    ).toEqual([second])
  })

  test("purges a workspace in bounded batches without touching another", async () => {
    await contactActivityRepository.upsertActivities(
      {
        records: [
          flowActivity(own.contactIds[0], T_EARLY, "1"),
          flowActivity(own.contactIds[0], T_EARLY, "2"),
          flowActivity(own.contactIds[0], T_EARLY, "3"),
        ],
        workspaceId: own.workspaceId,
      },
      database(),
    )
    await contactActivityRepository.upsertActivities(
      {
        records: [flowActivity(other.contactIds[0], T_EARLY)],
        workspaceId: other.workspaceId,
      },
      database(),
    )

    expect(
      await contactActivityRepository.deleteWorkspaceBatch({
        limit: 2,
        table: "ContactActivity",
        workspaceId: own.workspaceId,
      }),
    ).toBe(2)
    expect(
      await contactActivityRepository.hasWorkspaceRows({
        table: "ContactActivity",
        workspaceId: own.workspaceId,
      }),
    ).toBe(true)
    expect(
      await contactActivityRepository.deleteWorkspaceBatch({
        limit: 2,
        table: "ContactActivity",
        workspaceId: own.workspaceId,
      }),
    ).toBe(1)
    expect(
      await contactActivityRepository.hasWorkspaceRows({
        table: "ContactActivity",
        workspaceId: own.workspaceId,
      }),
    ).toBe(false)
    expect(await activityRows(other.workspaceId)).toHaveLength(1)
  })

  test("the workspace fence closes once the purge starts", async () => {
    const db = database()
    expect(
      await workspaceRepository.lockWorkspaceForChildWrite(
        { workspaceId: own.workspaceId },
        db,
      ),
    ).toBe(true)

    await db
      .update(schema.workspaceModel)
      .set({ purgeStartedAt: new Date() })
      .where(eq(schema.workspaceModel.id, own.workspaceId))

    expect(
      await workspaceRepository.lockWorkspaceForChildWrite(
        { workspaceId: own.workspaceId },
        db,
      ),
    ).toBe(false)
  })

  test("workspace-scoped reads prune to one partition for custom and generic plans", async () => {
    await contactActivityRepository.upsertActivities(
      {
        records: [flowActivity(own.contactIds[0], T_EARLY)],
        workspaceId: own.workspaceId,
      },
      database(),
    )
    const customPlan = await client.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM "ContactActivity" WHERE "workspaceId" = $1`,
      [own.workspaceId],
    )
    await client.query(
      `PREPARE contact_activity_ws(bigint) AS SELECT * FROM "ContactActivity" WHERE "workspaceId" = $1`,
    )
    try {
      await client.query("SET plan_cache_mode = force_generic_plan")
      const genericPlan = await client.query<{ "QUERY PLAN": unknown }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) EXECUTE contact_activity_ws(${own.workspaceId})`,
      )
      expect(
        new Set(collectExecutedPartitions(customPlan.rows[0]?.["QUERY PLAN"]))
          .size,
      ).toBe(1)
      expect(
        new Set(collectExecutedPartitions(genericPlan.rows[0]?.["QUERY PLAN"]))
          .size,
      ).toBe(1)
    } finally {
      await client.query("DEALLOCATE contact_activity_ws")
      await client.query("RESET plan_cache_mode")
    }
  })
})
