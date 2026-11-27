// @vitest-environment node

/**
 * The board's activity filter against real Postgres: one activity row of the
 * item, recorded in the board's own pipeline, must satisfy every set part
 * (kinds, actor, time). Rows recorded under another pipeline never match.
 *
 * Runs only against an explicitly configured database
 * (`pnpm --filter @chatbotx.io/database test:db`).
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  type PipelineActivityKind,
  type PipelineActorKind,
  pipelineSettingsSchema,
} from "../../src/partials/pipeline"
import { relations } from "../../src/relations"
import {
  type PipelineActivityMatch,
  pipelineActivityRepository,
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "../../src/repositories/pipeline"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const day = (value: string) => new Date(`${value}T12:00:00.000Z`)

type ActivitySeed = {
  kind: PipelineActivityKind
  actorKind: PipelineActorKind
  actorUserId?: string
  at: string
  /** Record the row under the other pipeline of the workspace. */
  elsewhere?: boolean
}

describe.skipIf(!databaseUrl)("pipeline activity filter SQL", () => {
  let client: Client
  let userId: string
  let workspaceId: string
  let pipelineId: string
  let otherPipelineId: string
  let stageId: string
  let contactId: string
  let anotherUserId: string
  const database = () => drizzle({ client, relations, schema })

  const insertPipeline = async (referenceName: string) => {
    const db = database()
    const pipeline = await pipelineRepository.insert(
      {
        workspaceId,
        name: referenceName,
        type: "opportunity",
        referenceName,
        currency: "USD",
        settings: pipelineSettingsSchema.parse({}),
      },
      db,
    )
    const [stage] = await pipelineStageRepository.insertMany(
      [{ workspaceId, pipelineId: pipeline.id, name: "Lead", position: 0 }],
      db,
    )
    return { pipelineId: pipeline.id, stageId: stage.id }
  }

  const seedItem = async (title: string, activities: ActivitySeed[]) => {
    const db = database()
    const item = await db.transaction(async (tx) => {
      const number = await pipelineRepository.nextItemNumber(workspaceId, tx)
      const { row } = await pipelineItemRepository.insertIdempotent(
        {
          workspaceId,
          pipelineId,
          stageId,
          contactId,
          number,
          title,
          status: "open",
          priority: "medium",
          fieldValues: {},
          stageEnteredAt: new Date(),
        },
        tx,
      )
      return row
    })
    for (const activity of activities) {
      await db.insert(schema.pipelineItemActivityModel).values({
        workspaceId,
        pipelineId: activity.elsewhere ? otherPipelineId : pipelineId,
        itemId: item.id,
        itemNumber: item.number,
        itemTitle: title,
        contactId,
        kind: activity.kind,
        actorKind: activity.actorKind,
        actorUserId: activity.actorUserId ?? null,
        occurredAt: day(activity.at),
      })
    }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const users = await db
      .insert(schema.userModel)
      .values([
        { email: `activity-filter-a-${suffix}@example.test` },
        { email: `activity-filter-b-${suffix}@example.test` },
      ])
      .returning({ id: schema.userModel.id })
    userId = users[0].id
    anotherUserId = users[1].id
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `activity-filter-${suffix}`, ownerId: userId })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    const [contact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId })
      .returning({ id: schema.contactModel.id })
    contactId = contact.id
    const own = await insertPipeline("sales")
    pipelineId = own.pipelineId
    stageId = own.stageId
    otherPipelineId = (await insertPipeline("support")).pipelineId

    await seedItem("Stage by user", [
      {
        kind: "stageChanged",
        actorKind: "user",
        actorUserId: userId,
        at: "2026-03-10",
      },
    ])
    await seedItem("Status by flow", [
      { kind: "statusChanged", actorKind: "flow", at: "2026-03-20" },
    ])
    await seedItem("Comment by other user", [
      {
        kind: "commentAdded",
        actorKind: "user",
        actorUserId: anotherUserId,
        at: "2026-04-05",
      },
    ])
    // Two rows, each satisfying only one part of "stage change by the user".
    await seedItem("Split rows", [
      { kind: "stageChanged", actorKind: "flow", at: "2026-03-10" },
      {
        kind: "commentAdded",
        actorKind: "user",
        actorUserId: userId,
        at: "2026-03-10",
      },
    ])
    // Matching row recorded under another pipeline (before a transfer).
    await seedItem("Other pipeline only", [
      {
        kind: "stageChanged",
        actorKind: "user",
        actorUserId: userId,
        at: "2026-03-10",
        elsewhere: true,
      },
    ])
    await seedItem("No activity", [])
  })

  afterAll(async () => {
    const db = database()
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, workspaceId))
    for (const id of [userId, anotherUserId]) {
      await db.delete(schema.userModel).where(eq(schema.userModel.id, id))
    }
    await client.end()
  })

  const titles = async (activityMatch?: PipelineActivityMatch) =>
    (
      await pipelineItemRepository.listStagePage({
        workspaceId,
        pipelineId,
        stageId,
        sort: { key: "createdAt", direction: "asc" },
        limit: 50,
        filter: { activityMatch },
      })
    ).items.map((item) => item.title)

  test("no condition (or an empty one) filters nothing", async () => {
    const all = [
      "Stage by user",
      "Status by flow",
      "Comment by other user",
      "Split rows",
      "Other pipeline only",
      "No activity",
    ]
    expect(await titles()).toEqual(all)
    expect(await titles({})).toEqual(all)
    expect(await titles({ kinds: [], actorUserIds: [] })).toEqual(all)
  })

  test("kinds match any of the listed kinds", async () => {
    expect(await titles({ kinds: ["stageChanged"] })).toEqual([
      "Stage by user",
      "Split rows",
    ])
    expect(await titles({ kinds: ["statusChanged", "commentAdded"] })).toEqual([
      "Status by flow",
      "Comment by other user",
      "Split rows",
    ])
  })

  test("actor user matches only user rows of that user", async () => {
    expect(await titles({ actorUserIds: [userId] })).toEqual([
      "Stage by user",
      "Split rows",
    ])
    expect(await titles({ actorUserIds: [userId, anotherUserId] })).toEqual([
      "Stage by user",
      "Comment by other user",
      "Split rows",
    ])
  })

  test("automation matches flow, trigger, token and system rows", async () => {
    expect(await titles({ automation: true })).toEqual([
      "Status by flow",
      "Split rows",
    ])
  })

  test("a user and automation are alternatives for who did it", async () => {
    expect(
      await titles({ actorUserIds: [anotherUserId], automation: true }),
    ).toEqual(["Status by flow", "Comment by other user", "Split rows"])
  })

  test("the date range bounds the row time inclusively", async () => {
    expect(
      await titles({
        occurredAt: { from: day("2026-03-15"), to: day("2026-04-30") },
      }),
    ).toEqual(["Status by flow", "Comment by other user"])
    expect(await titles({ occurredAt: { to: day("2026-03-10") } })).toEqual([
      "Stage by user",
      "Split rows",
    ])
  })

  test("every part must hold on ONE row: rows each satisfying one part do not match", async () => {
    // "Split rows" has a stage change (by a flow) and a comment (by the user).
    expect(
      await titles({ kinds: ["stageChanged"], actorUserIds: [userId] }),
    ).toEqual(["Stage by user"])
    expect(await titles({ kinds: ["commentAdded"], automation: true })).toEqual(
      [],
    )
    expect(
      await titles({
        kinds: ["stageChanged"],
        actorUserIds: [userId],
        occurredAt: { from: day("2026-03-01"), to: day("2026-03-31") },
      }),
    ).toEqual(["Stage by user"])
    expect(
      await titles({
        kinds: ["stageChanged"],
        actorUserIds: [userId],
        occurredAt: { from: day("2026-04-01") },
      }),
    ).toEqual([])
  })

  test("a row recorded under another pipeline never matches", async () => {
    expect(
      await titles({ kinds: ["stageChanged"], actorUserIds: [userId] }),
    ).not.toContain("Other pipeline only")
    expect(await titles({ actorUserIds: [userId] })).not.toContain(
      "Other pipeline only",
    )
    expect(await titles({ kinds: ["stageChanged"] })).not.toContain(
      "Other pipeline only",
    )
  })

  test("the per-kind activity date filter also ignores rows of another pipeline", async () => {
    const byKind = await pipelineItemRepository.listStagePage({
      workspaceId,
      pipelineId,
      stageId,
      sort: { key: "createdAt", direction: "asc" },
      limit: 50,
      filter: {
        activity: {
          stageChanged: { from: day("2026-01-01"), to: day("2026-12-31") },
        },
      },
    })

    expect(byKind.items.map((item) => item.title)).not.toContain(
      "Other pipeline only",
    )
  })

  test("a deleted contact's titles are cleared from history; other contacts and counts stay", async () => {
    const db = database()
    const otherContactId = "987654321"
    const row = (forContact: string, title: string) => ({
      workspaceId,
      pipelineId,
      itemId: "1",
      itemNumber: 1,
      itemTitle: title,
      contactId: forContact,
      kind: "titleChanged" as const,
      actorKind: "user" as const,
      fromTitle: `${title} before`,
      toTitle: title,
      occurredAt: day("2026-05-01"),
    })
    await db
      .insert(schema.pipelineItemActivityModel)
      .values([row(contactId, "Ada Lovelace"), row(otherContactId, "Kept")])

    await pipelineActivityRepository.scrubContactTitles(
      { workspaceId, contactIds: [contactId] },
      db,
    )

    const rows = await db
      .select({
        contactId: schema.pipelineItemActivityModel.contactId,
        itemTitle: schema.pipelineItemActivityModel.itemTitle,
        fromTitle: schema.pipelineItemActivityModel.fromTitle,
        toTitle: schema.pipelineItemActivityModel.toTitle,
      })
      .from(schema.pipelineItemActivityModel)
      .where(eq(schema.pipelineItemActivityModel.kind, "titleChanged"))
    const byContact = Map.groupBy(rows, (entry) => entry.contactId)

    expect(byContact.get(contactId)).toEqual([
      { contactId, itemTitle: "", fromTitle: null, toTitle: null },
    ])
    expect(byContact.get(otherContactId)?.[0]?.toTitle).toBe("Kept")
  })
})
