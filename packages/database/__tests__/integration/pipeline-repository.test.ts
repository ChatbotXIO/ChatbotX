// @vitest-environment node

/**
 * Real-SQL checks for the pipeline repositories: item numbering under
 * concurrency, idempotent inserts, keyset paging for every sort key (NULLs
 * last, both directions), the board window query, stage reorder, cascades and
 * workspace scoping. Runs only against an explicitly configured database with
 * the pipelines migration applied (`pnpm --filter @chatbotx.io/database test:db`).
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
import type { PipelineItemSortKey } from "../../src/partials/pipeline"
import { pipelineSettingsSchema } from "../../src/partials/pipeline"
import { relations } from "../../src/relations"
import {
  pipelineActivityRepository,
  pipelineItemContentRepository,
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
  pipelineVariableTargetRepository,
} from "../../src/repositories/pipeline"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const ONE_TARGET_CHECK = /PipelineItemAssignee_one_target_check/

type Fixture = {
  contactIds: string[]
  userId: string
  workspaceId: string
  pipelineId: string
  stageIds: string[]
}

describe.skipIf(!databaseUrl)("pipeline repositories", () => {
  let client: Client
  let own: Fixture
  let other: Fixture

  const database = () => drizzle({ client, relations, schema })

  const createFixture = async (label: string): Promise<Fixture> => {
    const db = database()
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `pipeline-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `pipeline-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const contacts = await db
      .insert(schema.contactModel)
      .values([{ workspaceId: workspace.id }, { workspaceId: workspace.id }])
      .returning({ id: schema.contactModel.id })
    const pipeline = await pipelineRepository.insert(
      {
        workspaceId: workspace.id,
        name: "Sales",
        type: "opportunity",
        referenceName: "sales",
        currency: "USD",
        settings: pipelineSettingsSchema.parse({}),
      },
      db,
    )
    const stages = await pipelineStageRepository.insertMany(
      ["Lead", "Won"].map((name, position) => ({
        workspaceId: workspace.id,
        pipelineId: pipeline.id,
        name,
        position,
      })),
      db,
    )
    return {
      contactIds: contacts.map((contact) => contact.id),
      userId: user.id,
      workspaceId: workspace.id,
      pipelineId: pipeline.id,
      stageIds: stages.map((stage) => stage.id),
    }
  }

  const cleanup = async (fixture: Fixture | undefined) => {
    if (!fixture) {
      return
    }
    const db = database()
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, fixture.workspaceId))
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, fixture.userId))
  }

  let sequence = 0
  const insertItem = async (
    fixture: Fixture,
    overrides: Partial<typeof schema.pipelineItemModel.$inferInsert> = {},
  ) => {
    const db = database()
    return await db.transaction(async (tx) => {
      const number = await pipelineRepository.nextItemNumber(
        fixture.workspaceId,
        tx,
      )
      sequence += 1
      const { row } = await pipelineItemRepository.insertIdempotent(
        {
          workspaceId: fixture.workspaceId,
          pipelineId: fixture.pipelineId,
          stageId: fixture.stageIds[0],
          contactId: fixture.contactIds[0],
          number,
          title: `Item ${sequence}`,
          status: "open",
          priority: "medium",
          fieldValues: {},
          stageEnteredAt: new Date(),
          ...overrides,
        },
        tx,
      )
      return row
    })
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    own = await createFixture("own")
    other = await createFixture("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  test("stores a pipeline with no currency override", async () => {
    const db = database()
    const row = await pipelineRepository.insert(
      {
        workspaceId: own.workspaceId,
        name: "Follows workspace",
        type: "opportunity",
        referenceName: "follows-workspace",
        currency: null,
        settings: pipelineSettingsSchema.parse({}),
      },
      db,
    )
    expect(row.currency).toBeNull()
  })

  test("pages every pipeline id of the workspace, whatever its currency, in id order", async () => {
    const db = database()
    const insertPipeline = async (
      fixture: Fixture,
      name: string,
      currency: string | null,
    ) =>
      await pipelineRepository.insert(
        {
          workspaceId: fixture.workspaceId,
          name,
          type: "opportunity",
          referenceName: name,
          currency,
          settings: pipelineSettingsSchema.parse({}),
        },
        db,
      )
    const follows = await insertPipeline(own, "follows", null)
    const overrides = await insertPipeline(own, "overrides", "USD")
    await insertPipeline(other, "other_workspace", null)
    const expected = [own.pipelineId, follows.id, overrides.id].sort((a, b) =>
      Number(BigInt(a) - BigInt(b)),
    )

    const pages: string[][] = []
    let afterId: string | null = null
    for (;;) {
      const page = await pipelineRepository.listIdsPage(
        { workspaceId: own.workspaceId, afterId, limit: 2 },
        db,
      )
      pages.push(page)
      if (page.length < 2) {
        break
      }
      afterId = page.at(-1) ?? null
    }

    // Two pages of two at most, never the other workspace's pipeline.
    expect(pages.flat()).toEqual(expected)
    expect(pages.map((page) => page.length)).toEqual([2, 1])
  })

  test("hands out consecutive item numbers per workspace under concurrency", async () => {
    const db = database()

    const numbers = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.transaction((tx) =>
          pipelineRepository.nextItemNumber(own.workspaceId, tx),
        ),
      ),
    )
    const otherFirst = await db.transaction((tx) =>
      pipelineRepository.nextItemNumber(other.workspaceId, tx),
    )

    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(otherFirst).toBe(1)
  })

  test("returns the existing row when an idempotency key is replayed", async () => {
    const first = await insertItem(own, { idempotencyKey: "k1" })
    const replay = await insertItem(own, { idempotencyKey: "k1" })

    expect(replay.id).toBe(first.id)
    expect(
      await pipelineItemRepository.countByStage({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        stageId: own.stageIds[0],
      }),
    ).toBe(1)
  })

  test("scopes an idempotency key to its pipeline", async () => {
    await insertItem(own, { idempotencyKey: "shared" })
    const elsewhere = await insertItem(other, { idempotencyKey: "shared" })

    expect(elsewhere.workspaceId).toBe(other.workspaceId)
  })

  describe("keyset paging", () => {
    const seed = async () => {
      const base = Date.parse("2026-01-01T00:00:00.000Z")
      const rows = [
        { value: 10, dueDate: new Date(base + 1000), priority: "low" },
        { value: 30, dueDate: new Date(base + 3000), priority: "high" },
        { value: null, dueDate: null, priority: "medium" },
        { value: 20, dueDate: new Date(base + 2000), priority: "high" },
        { value: null, dueDate: null, priority: "low" },
        { value: 30, dueDate: new Date(base + 3000), priority: "medium" },
      ] as const
      for (const row of rows) {
        await insertItem(own, { ...row })
      }
    }

    const collect = async (
      key: PipelineItemSortKey,
      direction: "asc" | "desc",
      pageSize: number,
    ) => {
      const ids: string[] = []
      let cursor: string | undefined
      for (let guard = 0; guard < 20; guard += 1) {
        const page = await pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          stageId: own.stageIds[0],
          sort: { key, direction },
          limit: pageSize,
          cursor,
        })
        ids.push(...page.items.map((item) => item.id))
        if (!page.nextCursor) {
          return { ids }
        }
        cursor = page.nextCursor
      }
      throw new Error("paging did not terminate")
    }

    test.each([
      ["createdAt", "asc"],
      ["createdAt", "desc"],
      ["updatedAt", "desc"],
      ["value", "asc"],
      ["value", "desc"],
      ["dueDate", "asc"],
      ["dueDate", "desc"],
      ["priority", "asc"],
      ["priority", "desc"],
    ] as const)("pages every item exactly once sorted by %s %s", async (key, direction) => {
      await seed()

      const paged = await collect(key, direction, 2)
      const single = await collect(key, direction, 100)

      expect(paged.ids).toHaveLength(6)
      expect(new Set(paged.ids).size).toBe(6)
      expect(paged.ids).toEqual(single.ids)
    })

    test("puts items without a value last in both directions", async () => {
      await seed()

      for (const direction of ["asc", "desc"] as const) {
        const { ids } = await collect("value", direction, 100)
        const rows = await Promise.all(
          ids.map((id) =>
            pipelineItemRepository.findById({
              workspaceId: own.workspaceId,
              id,
            }),
          ),
        )
        const values = rows.map((row) => row?.value ?? null)

        expect(values.slice(-2)).toEqual([null, null])
        expect(values.slice(0, 4)).toEqual(
          direction === "asc" ? [10, 20, 30, 30] : [30, 30, 20, 10],
        )
      }
    })

    test("rejects a tampered cursor value without reaching SQL", async () => {
      await seed()
      const { nextCursor } = await pipelineItemRepository.listStagePage({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        stageId: own.stageIds[0],
        sort: { key: "createdAt", direction: "desc" },
        limit: 2,
      })

      expect(nextCursor).not.toBeNull()
      await expect(
        pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          stageId: own.stageIds[0],
          sort: { key: "value", direction: "desc" },
          limit: 2,
          cursor: nextCursor as string,
        }),
      ).rejects.toThrow("Invalid cursor")
    })
  })

  test("board first page returns at most N items per stage plus stage totals", async () => {
    for (let index = 0; index < 3; index += 1) {
      await insertItem(own, { value: 10 })
    }
    await insertItem(own, { stageId: own.stageIds[1], value: 5 })

    const pages = await pipelineItemRepository.listBoardFirstPage({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      sort: { key: "createdAt", direction: "desc" },
      perStageLimit: 2,
    })
    const totals = await pipelineItemRepository.listStageTotals({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
    })

    const pageOf = (stageId: string) =>
      pages.find((page) => page.stageId === stageId)
    expect(pageOf(own.stageIds[0])?.items).toHaveLength(2)
    expect(pageOf(own.stageIds[1])?.items).toHaveLength(1)
    // 3 items, limit 2: the first stage has more, the second does not.
    expect(pageOf(own.stageIds[0])?.nextCursor).not.toBeNull()
    expect(pageOf(own.stageIds[1])?.nextCursor).toBeNull()
    const [first] = pageOf(own.stageIds[0])?.items ?? []
    expect(first).not.toHaveProperty("sortValue")
    expect(
      Object.fromEntries(
        totals.map((t) => [t.stageId, [t.count, t.totalValue]]),
      ),
    ).toEqual({
      [own.stageIds[0]]: [3, 30],
      [own.stageIds[1]]: [1, 5],
    })
  })

  test("filters by status, priority, search and field values", async () => {
    await insertItem(own, { title: "Alpha deal", priority: "high" })
    await insertItem(own, {
      title: "Beta",
      status: "won",
      fieldValues: { "99": "gold" },
    })

    const run = async (
      filter: Parameters<
        typeof pipelineItemRepository.listStagePage
      >[0]["filter"],
    ) =>
      (
        await pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          stageId: own.stageIds[0],
          sort: { key: "createdAt", direction: "desc" },
          limit: 10,
          filter,
        })
      ).items.map((item) => item.title)

    expect(await run({ statuses: ["won"] })).toEqual(["Beta"])
    expect(await run({ priorities: ["high"] })).toEqual(["Alpha deal"])
    expect(await run({ search: "alp" })).toEqual(["Alpha deal"])
    const closedDay = new Date("2026-02-10T12:00:00.000Z")
    await insertItem(own, {
      title: "Closed lost",
      status: "lost",
      closedAt: closedDay,
    })
    await insertItem(own, {
      title: "Closed won",
      status: "won",
      closedAt: closedDay,
    })
    const dayRange = {
      from: new Date("2026-02-10T00:00:00.000Z"),
      to: new Date("2026-02-10T23:59:59.999Z"),
    }
    expect(await run({ closedAs: { won: dayRange } })).toEqual(["Closed won"])
    expect(await run({ closedAs: { lost: dayRange } })).toEqual(["Closed lost"])
    expect(
      (await run({ closedAs: { won: dayRange, lost: dayRange } })).sort(),
    ).toEqual(["Closed lost", "Closed won"])
    expect(
      await run({
        closedAs: { won: dayRange, lost: { from: new Date("2030-01-01") } },
      }),
    ).toEqual(["Closed won"])
    expect((await run({ closedAt: dayRange })).sort()).toEqual([
      "Closed lost",
      "Closed won",
    ])
    const stamp = new Date("2026-03-05T12:00:00.000Z")
    const marchRange = {
      from: new Date("2026-03-05T00:00:00.000Z"),
      to: new Date("2026-03-05T23:59:59.999Z"),
    }
    await insertItem(own, {
      title: "Own timestamps",
      lastCommentAt: stamp,
      statusChangedAt: stamp,
      stageEnteredAt: stamp,
    })
    expect(await run({ lastCommentAt: marchRange })).toEqual(["Own timestamps"])
    expect(await run({ statusChangedAt: marchRange })).toEqual([
      "Own timestamps",
    ])
    expect(await run({ stageEnteredAt: marchRange })).toEqual([
      "Own timestamps",
    ])
    expect(
      await run({
        fieldConditions: { "99": { operator: "is", value: "gold" } },
        fieldTypes: { "99": "shortText" },
      }),
    ).toEqual(["Beta"])
    expect(await run({ search: '\'; drop table "PipelineItem"; --' })).toEqual(
      [],
    )
  })

  test("filters by value operators and per-field conditions", async () => {
    await insertItem(own, { title: "Low", value: 10 })
    await insertItem(own, { title: "Mid", value: 20 })
    await insertItem(own, { title: "High", value: 30 })
    await insertItem(own, { title: "Blank", value: null })
    const run = async (
      filter: Parameters<
        typeof pipelineItemRepository.listStagePage
      >[0]["filter"],
    ) =>
      (
        await pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          stageId: own.stageIds[0],
          sort: { key: "createdAt", direction: "asc" },
          limit: 20,
          filter,
        })
      ).items.map((item) => item.title)

    expect(await run({ value: { operator: "eq", amount: 20 } })).toEqual([
      "Mid",
    ])
    expect(await run({ value: { operator: "gt", amount: 20 } })).toEqual([
      "High",
    ])
    expect(await run({ value: { operator: "lt", amount: 20 } })).toEqual([
      "Low",
    ])
    // "Different" also matches the item without a value.
    expect(await run({ value: { operator: "ne", amount: 20 } })).toEqual([
      "Low",
      "High",
      "Blank",
    ])
    expect(
      await run({ value: { operator: "between", min: 15, max: 30 } }),
    ).toEqual(["Mid", "High"])
    // The legacy `{min,max}` shape is still an interval.
    expect(await run({ value: { min: 15, max: 25 } })).toEqual(["Mid"])
  })

  test("never returns another workspace's items", async () => {
    await insertItem(other, { title: "Foreign" })

    const page = await pipelineItemRepository.listStagePage({
      workspaceId: own.workspaceId,
      pipelineId: other.pipelineId,
      stageId: other.stageIds[0],
      sort: { key: "createdAt", direction: "desc" },
      limit: 10,
    })

    expect(page.items).toEqual([])
  })

  test("reorders stages in one statement", async () => {
    const [first, second] = own.stageIds

    await pipelineStageRepository.reorder({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      stageIds: [second, first],
    })
    const stages = await pipelineStageRepository.listByPipeline({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
    })

    expect(stages.map((stage) => stage.id)).toEqual([second, first])
  })

  test("moves and deletes a stage's items in bounded batches", async () => {
    for (let index = 0; index < 5; index += 1) {
      await insertItem(own)
    }
    const db = database()

    const moved = await db.transaction((tx) =>
      pipelineItemRepository.moveStageItemsBatch(
        {
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          fromStageId: own.stageIds[0],
          toStageId: own.stageIds[1],
          limit: 3,
          now: new Date(),
        },
        tx,
      ),
    )
    const deleted = await db.transaction((tx) =>
      pipelineItemRepository.deleteStageItemsBatch(
        {
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          stageId: own.stageIds[0],
          limit: 500,
        },
        tx,
      ),
    )

    expect(moved).toHaveLength(3)
    expect(deleted).toHaveLength(2)
  })

  test("removes a deleted field key in bounded batches without touching updatedAt", async () => {
    for (let index = 0; index < 5; index += 1) {
      await insertItem(own, { fieldValues: { "7": "a", "8": "b" } })
    }
    const db = database()
    const before = new Map(
      (
        await db
          .select({
            id: schema.pipelineItemModel.id,
            updatedAt: schema.pipelineItemModel.updatedAt,
          })
          .from(schema.pipelineItemModel)
          .where(eq(schema.pipelineItemModel.workspaceId, own.workspaceId))
      ).map((row) => [row.id, +row.updatedAt]),
    )
    let afterId: string | undefined
    const strip = async (limit: number) => {
      const batch = await db.transaction((tx) =>
        pipelineRepository.stripFieldKeyBatch(
          {
            workspaceId: own.workspaceId,
            pipelineId: own.pipelineId,
            fieldId: "7",
            limit,
            afterId,
          },
          tx,
        ),
      )
      afterId = batch.lastId ?? afterId
      return batch.scanned
    }

    expect(await strip(2)).toBe(2)
    expect(await strip(2)).toBe(2)
    expect(await strip(2)).toBe(1)
    const items = await db
      .select()
      .from(schema.pipelineItemModel)
      .where(eq(schema.pipelineItemModel.workspaceId, own.workspaceId))

    expect(items.map((item) => item.fieldValues)).toEqual(
      Array.from({ length: 5 }, () => ({ "8": "b" })),
    )
    expect(items.every((item) => +item.updatedAt === before.get(item.id))).toBe(
      true,
    )
  })

  describe("stage drain vs a concurrent move out of the stage", () => {
    const WAIT_MS = 300
    const wait = () => new Promise((resolve) => setTimeout(resolve, WAIT_MS))

    // Holds a row lock on `movedId` while a drain batch runs on another
    // connection, then commits the move and lets the drain finish.
    const drainWhileMoving = async (
      run: (tx: ReturnType<typeof database>) => Promise<unknown[]>,
      movedId: string,
    ) => {
      const second = new Client({ connectionString: databaseUrl as string })
      await second.connect()
      try {
        const mover = database()
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        let locked: () => void = () => undefined
        const lockedP = new Promise<void>((resolve) => {
          locked = resolve
        })
        const move = mover.transaction(async (tx) => {
          await tx
            .update(schema.pipelineItemModel)
            .set({ stageId: own.stageIds[1] })
            .where(eq(schema.pipelineItemModel.id, movedId))
          locked()
          await gate
        })
        await lockedP
        const drainDb = drizzle({ client: second, relations, schema })
        const drain = drainDb.transaction(async (tx) => await run(tx as never))
        await wait()
        release()
        await move
        return await drain
      } finally {
        await second.end()
      }
    }

    test("a delete batch skips an item that left the stage while it waited", async () => {
      const moved = await insertItem(own)
      const stays = await insertItem(own)

      const removed = (await drainWhileMoving(
        (tx) =>
          pipelineItemRepository.deleteStageItemsBatch(
            {
              workspaceId: own.workspaceId,
              pipelineId: own.pipelineId,
              stageId: own.stageIds[0],
              limit: 10,
            },
            tx as never,
          ),
        moved.id,
      )) as { id: string }[]

      expect(removed.map((row) => row.id)).toEqual([stays.id])
      const survivors = await database()
        .select({
          id: schema.pipelineItemModel.id,
          stageId: schema.pipelineItemModel.stageId,
        })
        .from(schema.pipelineItemModel)
        .where(eq(schema.pipelineItemModel.workspaceId, own.workspaceId))
      expect(survivors).toEqual([{ id: moved.id, stageId: own.stageIds[1] }])
    })

    test("a move batch does not drag back an item that already left", async () => {
      const moved = await insertItem(own)
      await insertItem(own)
      const third = own.stageIds[1]

      const rows = (await drainWhileMoving(
        (tx) =>
          pipelineItemRepository.moveStageItemsBatch(
            {
              workspaceId: own.workspaceId,
              pipelineId: own.pipelineId,
              fromStageId: own.stageIds[0],
              toStageId: third,
              limit: 10,
              now: new Date(Date.now() + 86_400_000),
            },
            tx as never,
          ),
        moved.id,
      )) as { id: string; stageEnteredAt: Date }[]

      expect(rows.map((row) => row.id)).not.toContain(moved.id)
      expect(rows).toHaveLength(1)
    })
  })

  test("deletes a pipeline's items and activity in bounded batches", async () => {
    for (let index = 0; index < 5; index += 1) {
      await insertItem(own)
    }
    const db = database()
    await pipelineActivityRepository.insertMany(
      Array.from({ length: 5 }, (_, index) => ({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        itemId: String(index + 1),
        itemNumber: index + 1,
        itemTitle: "x",
        contactId: own.contactIds[0],
        kind: "created" as const,
        actorKind: "user" as const,
        occurredAt: new Date(),
      })),
      db,
    )
    const input = {
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      limit: 3,
    }
    const run = (fn: (tx: ReturnType<typeof database>) => Promise<number>) =>
      db.transaction((tx) => fn(tx as never))

    const items = [
      await run((tx) =>
        pipelineItemRepository.deletePipelineItemsBatch(input, tx as never),
      ),
      await run((tx) =>
        pipelineItemRepository.deletePipelineItemsBatch(input, tx as never),
      ),
      await run((tx) =>
        pipelineItemRepository.deletePipelineItemsBatch(input, tx as never),
      ),
    ]
    const activity = [
      await run((tx) =>
        pipelineActivityRepository.deleteByPipelineBatch(input, tx as never),
      ),
      await run((tx) =>
        pipelineActivityRepository.deleteByPipelineBatch(input, tx as never),
      ),
      await run((tx) =>
        pipelineActivityRepository.deleteByPipelineBatch(input, tx as never),
      ),
    ]

    expect(items).toEqual([3, 2, 0])
    expect(activity).toEqual([3, 2, 0])
  })

  test("finds the latest open item and counts open items, optionally leaving one out", async () => {
    const db = database()
    const older = await insertItem(own)
    await insertItem(own, { status: "won" })
    const newest = await insertItem(own)
    await insertItem(own, { contactId: own.contactIds[1] })
    const scope = {
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      contactId: own.contactIds[0],
    }

    const latest = await pipelineItemRepository.findLatestOpenForContact(
      scope,
      db,
    )
    const count = await pipelineItemRepository.countOpenForContact(scope, db)
    const countExcept = await pipelineItemRepository.countOpenForContact(
      { ...scope, exceptItemId: newest.id },
      db,
    )
    const none = await pipelineItemRepository.findLatestOpenForContact(
      { ...scope, workspaceId: other.workspaceId },
      db,
    )

    expect(latest?.id).toBe(newest.id)
    expect(latest?.id).not.toBe(older.id)
    expect(count).toBe(2)
    expect(countExcept).toBe(1)
    expect(none).toBeUndefined()
  })

  test("finds the contact's last created or updated item across pipelines", async () => {
    const db = database()
    const older = await insertItem(own)
    const newer = await insertItem(own)
    const scope = {
      workspaceId: own.workspaceId,
      contactId: own.contactIds[0],
    }

    const afterCreate =
      await pipelineVariableTargetRepository.findLastTouchedItemId(scope, db)
    await db
      .update(schema.pipelineItemModel)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.pipelineItemModel.id, older.id))
    const afterUpdate =
      await pipelineVariableTargetRepository.findLastTouchedItemId(scope, db)
    const otherContact =
      await pipelineVariableTargetRepository.findLastTouchedItemId(
        { ...scope, contactId: own.contactIds[1] },
        db,
      )
    const otherWorkspace =
      await pipelineVariableTargetRepository.findLastTouchedItemId(
        { ...scope, workspaceId: other.workspaceId },
        db,
      )

    expect(afterCreate).toBe(newer.id)
    expect(afterUpdate).toBe(older.id)
    expect(otherContact).toBeNull()
    expect(otherWorkspace).toBeNull()
  })

  test("requires exactly one assignee target", async () => {
    const item = await insertItem(own)

    await expect(
      client.query(
        `INSERT INTO "PipelineItemAssignee" ("id","workspaceId","itemId") VALUES (1,$1,$2)`,
        [own.workspaceId, item.id],
      ),
    ).rejects.toThrow(ONE_TARGET_CHECK)
  })

  test("keeps activity after the item is deleted and drops it with the pipeline", async () => {
    const item = await insertItem(own)
    await pipelineActivityRepository.insertMany([
      {
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        itemId: item.id,
        itemNumber: item.number,
        itemTitle: item.title,
        contactId: item.contactId,
        kind: "created",
        actorKind: "user",
        occurredAt: new Date(),
      },
    ])

    await pipelineItemRepository.delete({
      workspaceId: own.workspaceId,
      id: item.id,
    })
    const afterItemDelete = await pipelineActivityRepository.listForItem({
      workspaceId: own.workspaceId,
      itemId: item.id,
      limit: 10,
    })
    await pipelineRepository.delete({
      workspaceId: own.workspaceId,
      id: own.pipelineId,
    })
    const afterPipelineDelete = await pipelineActivityRepository.listForItem({
      workspaceId: own.workspaceId,
      itemId: item.id,
      limit: 10,
    })

    expect(afterItemDelete.items).toHaveLength(1)
    expect(afterPipelineDelete.items).toHaveLength(0)
  })

  test("filters activity to the requested kinds", async () => {
    const item = await insertItem(own)
    const row = (kind: "created" | "stageChanged" | "commentAdded") => ({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      itemId: item.id,
      itemNumber: item.number,
      itemTitle: item.title,
      contactId: item.contactId,
      kind,
      actorKind: "user" as const,
      occurredAt: new Date(),
    })
    await pipelineActivityRepository.insertMany([
      row("created"),
      row("stageChanged"),
      row("commentAdded"),
    ])

    const filtered = await pipelineActivityRepository.listForItem({
      workspaceId: own.workspaceId,
      itemId: item.id,
      limit: 10,
      kinds: ["stageChanged", "commentAdded"],
    })
    const all = await pipelineActivityRepository.listForItem({
      workspaceId: own.workspaceId,
      itemId: item.id,
      limit: 10,
    })

    expect(filtered.items.map(({ kind }) => kind).sort()).toEqual([
      "commentAdded",
      "stageChanged",
    ])
    expect(all.items).toHaveLength(3)
  })

  test("pages activity newest first without gaps or repeats on equal timestamps", async () => {
    const item = await insertItem(own)
    const at = new Date("2026-04-01T08:00:00.123456Z")
    await pipelineActivityRepository.insertMany(
      Array.from({ length: 25 }, () => ({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        itemId: item.id,
        itemNumber: item.number,
        itemTitle: item.title,
        contactId: item.contactId,
        kind: "commentAdded" as const,
        actorKind: "user" as const,
        occurredAt: at,
      })),
    )
    const read = (cursor?: string) =>
      pipelineActivityRepository.listForItem({
        workspaceId: own.workspaceId,
        itemId: item.id,
        limit: 20,
        cursor,
      })

    const first = await read()
    const second = await read(first.nextCursor ?? undefined)

    expect(first.items).toHaveLength(20)
    expect(second.items).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    const ids = [...first.items, ...second.items].map((row) => row.id)
    expect(new Set(ids).size).toBe(25)
    await expect(read("not-a-cursor")).rejects.toThrow("Invalid cursor")
    // A null-ranked cursor cannot come from a timestamp page; it must not
    // silently restart from the first page.
    const nullCursor = Buffer.from(
      JSON.stringify({
        v: 1,
        sort: "createdAt",
        dir: "desc",
        nullRank: 1,
        sortValue: null,
        id: "1",
      }),
    ).toString("base64url")
    await expect(read(nullCursor)).rejects.toThrow("Invalid cursor")
    await expect(
      pipelineItemContentRepository.listComments({
        workspaceId: own.workspaceId,
        itemId: item.id,
        limit: 10,
        cursor: nullCursor,
      }),
    ).rejects.toThrow("Invalid cursor")
  })

  test("counts created, won and lost transitions per day and per actor", async () => {
    const at = new Date("2026-03-10T12:00:00.000Z")
    const base = {
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      itemId: "1",
      itemNumber: 1,
      itemTitle: "x",
      contactId: own.contactIds[0],
      actorKind: "user" as const,
      actorUserId: own.userId,
      occurredAt: at,
    }
    await pipelineActivityRepository.insertMany([
      { ...base, kind: "created", toValue: 100 },
      { ...base, kind: "statusChanged", toStatus: "won", toValue: 100 },
      { ...base, kind: "statusChanged", toStatus: "lost", toValue: 50 },
      { ...base, kind: "stageChanged" },
    ])
    const range = {
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.000Z"),
    }

    const daily = await pipelineActivityRepository.dailySeries({
      ...range,
      timezone: "UTC",
    })
    const byActor = await pipelineActivityRepository.totalsByActor(range)

    expect(daily.every((row) => row.day === "2026-03-10")).toBe(true)
    expect(daily.map((row) => row.kind).sort()).toEqual([
      "created",
      "statusChanged",
      "statusChanged",
    ])
    expect(byActor.every((row) => row.actorUserId === own.userId)).toBe(true)
  })
})
