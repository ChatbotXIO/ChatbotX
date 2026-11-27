// @vitest-environment node

/**
 * Real-SQL checks for the pipeline repositories: item numbering under
 * concurrency, idempotent inserts, keyset paging for every sort key (NULLs
 * last, both directions), the board window query, stage reorder, cascades and
 * workspace scoping. Runs only against an explicitly configured database with
 * the pipelines migration applied (`pnpm --filter @chatbotx.io/database test:db`).
 */

import { eq, inArray } from "drizzle-orm"
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
  decodePipelineItemCursor,
  ManualSortRequiresStageError,
  pipelineActivityRepository,
  pipelineItemContentRepository,
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
  pipelineVariableTargetRepository,
  RESPACE_EXISTING_MAX,
} from "../../src/repositories/pipeline"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const ONE_TARGET_CHECK = /PipelineItemAssignee_one_target_check/
const POSITION_FINITE_CHECK = /PipelineItem_position_finite_check/
const POSITION_INDEX = "PipelineItem_stage_position_idx"

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
      ["manual", "asc"],
      ["manual", "desc"],
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
    const strip = async (limit: number) =>
      await db.transaction(async (tx) => {
        const scope = {
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          fieldId: "7",
        }
        const holders = await pipelineRepository.listFieldKeyHolders(
          { ...scope, limit, afterId },
          tx,
        )
        await pipelineRepository.stripFieldKeyFromItems(
          {
            ...scope,
            ids: holders.map((holder) => holder.id),
            stageIds: [...new Set(holders.map((holder) => holder.stageId))],
          },
          tx,
        )
        afterId = holders.at(-1)?.id ?? afterId
        return holders.length
      })

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

  describe("manual order", () => {
    const sortAsc = { key: "manual", direction: "asc" } as const
    const sortDesc = { key: "manual", direction: "desc" } as const
    const stage = (index: number) => own.stageIds[index]

    const scope = (stageId: string = stage(0)) => ({
      workspaceId: own.workspaceId,
      pipelineId: own.pipelineId,
      stageId,
    })

    const insertAt = async (position: number, stageId: string = stage(0)) =>
      await insertItem(own, { position, stageId, title: `p${position}` })

    // One connection serves the whole suite: seed one row at a time.
    const insertAll = async (positions: number[]) => {
      const rows: Awaited<ReturnType<typeof insertItem>>[] = []
      for (const position of positions) {
        rows.push(await insertAt(position))
      }
      return rows
    }

    const readPositions = async (ids: string[]) => {
      const rows = await database()
        .select({
          id: schema.pipelineItemModel.id,
          position: schema.pipelineItemModel.position,
          updatedAt: schema.pipelineItemModel.updatedAt,
        })
        .from(schema.pipelineItemModel)
        .where(inArray(schema.pipelineItemModel.id, ids))
      return new Map(rows.map((row) => [row.id, row]))
    }

    const pageManual = async (
      sort: typeof sortAsc | typeof sortDesc,
      limit: number,
      stageId: string = stage(0),
    ) => {
      const ids: string[] = []
      let cursor: string | undefined
      for (let guard = 0; guard < 50; guard += 1) {
        const page = await pipelineItemRepository.listStagePage({
          ...scope(stageId),
          sort,
          limit,
          cursor,
        })
        ids.push(...page.items.map((item) => item.id))
        if (!page.nextCursor) {
          return ids
        }
        cursor = page.nextCursor
      }
      throw new Error("paging did not terminate")
    }

    test("a new item with no explicit position lands on top of the stage", async () => {
      const first = await insertItem(own, { title: "first" })
      const second = await insertItem(own, { title: "second" })
      const third = await insertItem(own, { title: "third" })

      expect(await pageManual(sortAsc, 10)).toEqual([
        third.id,
        second.id,
        first.id,
      ])
      expect(await pageManual(sortDesc, 10)).toEqual([
        first.id,
        second.id,
        third.id,
      ])
    })

    test("insertIdempotent writes an explicit position and keeps it on replay", async () => {
      const row = await insertItem(own, {
        position: -77.5,
        idempotencyKey: "pos-1",
      })
      const replay = await insertItem(own, {
        position: 999,
        idempotencyKey: "pos-1",
      })

      expect(row.position).toBe(-77.5)
      expect(replay.id).toBe(row.id)
      expect(replay.position).toBe(-77.5)
    })

    test("orders equal positions by id and pages them without gaps or repeats", async () => {
      const ids: string[] = []
      for (const position of [10, 10, 10, 5, 20, 10]) {
        ids.push((await insertAt(position)).id)
      }
      const byId = (a: string, b: string) => Number(BigInt(a) - BigInt(b))
      const expected = [
        ids[3],
        ...[ids[0], ids[1], ids[2], ids[5]].sort(byId),
        ids[4],
      ]

      expect(await pageManual(sortAsc, 2)).toEqual(expected)
      expect(await pageManual(sortDesc, 2)).toEqual([...expected].reverse())
    })

    test("the board first page of a stage is ordered by manual position and resumes from its cursor", async () => {
      const high = await insertAt(30)
      const low = await insertAt(10)
      const mid = await insertAt(20)
      const elsewhere = await insertAt(5, stage(1))

      const pages = await pipelineItemRepository.listBoardFirstPage({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        sort: sortAsc,
        perStageLimit: 2,
      })
      const first = pages.find((page) => page.stageId === stage(0))
      const second = pages.find((page) => page.stageId === stage(1))

      expect(first?.items.map((item) => item.id)).toEqual([low.id, mid.id])
      expect(second?.items.map((item) => item.id)).toEqual([elsewhere.id])
      expect(second?.nextCursor).toBeNull()
      const rest = await pipelineItemRepository.listStagePage({
        ...scope(),
        sort: sortAsc,
        limit: 2,
        cursor: first?.nextCursor as string,
      })
      expect(rest.items.map((item) => item.id)).toEqual([high.id])
      expect(rest.nextCursor).toBeNull()
    })

    test("a pipeline-wide list cannot be sorted manually", async () => {
      await insertAt(1)

      await expect(
        pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          sort: sortAsc,
          limit: 10,
        }),
      ).rejects.toBeInstanceOf(ManualSortRequiresStageError)
    })

    test("a single stageId in the filter makes a manual list stage-scoped", async () => {
      const second = await insertAt(2)
      const first = await insertAt(1)
      await insertAt(0, stage(1))
      const list = (stageIds: string[]) =>
        pipelineItemRepository.listStagePage({
          workspaceId: own.workspaceId,
          pipelineId: own.pipelineId,
          filter: { stageIds },
          sort: sortAsc,
          limit: 1,
        })

      const page = await list([stage(0)])
      const next = await pipelineItemRepository.listStagePage({
        workspaceId: own.workspaceId,
        pipelineId: own.pipelineId,
        filter: { stageIds: [stage(0)] },
        sort: sortAsc,
        limit: 1,
        cursor: page.nextCursor as string,
      })

      expect(page.items.map((item) => item.id)).toEqual([first.id])
      expect(next.items.map((item) => item.id)).toEqual([second.id])
      await expect(list([stage(0), stage(1)])).rejects.toBeInstanceOf(
        ManualSortRequiresStageError,
      )
      await expect(list([])).rejects.toBeInstanceOf(
        ManualSortRequiresStageError,
      )
    })

    test("round-trips float8 positions through the text cursor for every exponent form", async () => {
      const positions = [
        -1.797_693_134_862_315_7e308, -1_769_425_200_000.123, -1e21, -0.1, -0,
        5e-324, 1e-5, 0.1, 123_456_789.123_456_79, 1e21,
        1.797_693_134_862_315_7e308,
      ]
      const rows = await insertAll(positions)
      const expected = rows
        .map((row, index) => ({
          id: row.id,
          value: positions[index] as number,
        }))
        .sort(
          (a, b) => a.value - b.value || Number(BigInt(a.id) - BigInt(b.id)),
        )
        .map((row) => row.id)

      expect(await pageManual(sortAsc, 1)).toEqual(expected)
      expect(await pageManual(sortDesc, 1)).toEqual([...expected].reverse())
      // JS never sends a negative zero, so write it in SQL: Postgres prints it
      // as "-0" and the cursor must accept that text.
      const negativeZero = await insertAt(0)
      await client.query(
        `UPDATE "PipelineItem" SET "position" = '-0'::float8 WHERE id = $1`,
        [negativeZero.id],
      )
      expect(await pageManual(sortAsc, 1)).toContain(negativeZero.id)
      const textRows = await client.query<{ text: string }>(
        `SELECT "position"::text AS text FROM "PipelineItem" WHERE "stageId" = $1`,
        [stage(0)],
      )
      expect(textRows.rows.map((row) => row.text)).toEqual(
        expect.arrayContaining(["5e-324", "1e-05", "-0", "1e+21"]),
      )
      for (const { text } of textRows.rows) {
        const cursor = Buffer.from(
          JSON.stringify({
            v: 1,
            sort: "manual",
            dir: "asc",
            nullRank: 0,
            sortValue: text,
            id: "1",
          }),
        ).toString("base64url")
        expect(() => decodePipelineItemCursor(cursor, sortAsc)).not.toThrow()
      }
    })

    test.each([
      ["NaN"],
      ["Infinity"],
      ["-Infinity"],
    ])("the finite check rejects %s", async (value) => {
      const item = await insertAt(1)

      await expect(
        client.query(
          `UPDATE "PipelineItem" SET "position" = $1 WHERE id = $2`,
          [value, item.id],
        ),
      ).rejects.toThrow(POSITION_FINITE_CHECK)
      await expect(
        client.query(
          `INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","position","updatedAt") VALUES (987654321,$1,$2,$3,$4,987654,'x','open','medium','{}',now(),$5,now())`,
          [own.workspaceId, own.pipelineId, stage(0), own.contactIds[0], value],
        ),
      ).rejects.toThrow(POSITION_FINITE_CHECK)
    })

    test("a row written without a position takes the newest-on-top default", async () => {
      const before = Date.now()
      const result = await client.query<{ position: number }>(
        `INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt") VALUES (987654322,$1,$2,$3,$4,987655,'raw','open','medium','{}',now(),now()) RETURNING "position"`,
        [own.workspaceId, own.pipelineId, stage(0), own.contactIds[0]],
      )
      const written = result.rows[0]?.position as number

      expect(written).toBeLessThan(0)
      expect(Math.abs(Math.abs(written) - before)).toBeLessThan(60_000)
    })

    describe("repository methods", () => {
      test("stageEdgeAnchor reads the top and bottom, optionally leaving an item out", async () => {
        const low = await insertAt(-5)
        await insertAt(3)
        const high = await insertAt(9)
        await insertAt(100, stage(1))

        const edge = (
          edge: "top" | "bottom",
          excludeItemId?: string,
          stageId: string = stage(0),
        ) =>
          database().transaction((tx) =>
            pipelineItemRepository
              .stageEdgeAnchor({ ...scope(stageId), edge, excludeItemId }, tx)
              .then((anchor) => anchor?.position ?? null),
          )

        expect(await edge("top")).toBe(-5)
        expect(await edge("bottom")).toBe(9)
        expect(await edge("top", low.id)).toBe(3)
        expect(await edge("bottom", high.id)).toBe(3)
        expect(await edge("top", undefined, stage(1))).toBe(100)
      })

      test("stageEdgeAnchor is null for an empty stage and for a stage holding only the excluded item", async () => {
        const only = await insertAt(4, stage(1))
        const edge = (stageId: string, excludeItemId?: string) =>
          database().transaction((tx) =>
            pipelineItemRepository.stageEdgeAnchor(
              { ...scope(stageId), edge: "top", excludeItemId },
              tx,
            ),
          )

        expect(await edge(stage(0))).toBeNull()
        expect(await edge(stage(1), only.id)).toBeNull()
      })

      test("findPlacementAnchor only finds an item of this stage and pipeline", async () => {
        const inStage = await insertAt(7)
        const inOtherStage = await insertAt(8, stage(1))
        const foreign = await insertItem(other, { position: 1 })
        const find = (itemId: string, stageId: string = stage(0)) =>
          database().transaction((tx) =>
            pipelineItemRepository.findPlacementAnchor(
              { ...scope(stageId), itemId },
              tx,
            ),
          )

        expect(await find(inStage.id)).toEqual({ id: inStage.id, position: 7 })
        expect(await find(inOtherStage.id)).toBeUndefined()
        expect(await find(foreign.id)).toBeUndefined()
        expect(await find("9223372036854775807")).toBeUndefined()
      })

      test("neighbour returns the adjacent row in (position, id) order and null at the ends", async () => {
        const a = await insertAt(10)
        const b = await insertAt(20)
        const c = await insertAt(20)
        const d = await insertAt(30)
        const tied = [b, c].sort((x, y) => Number(BigInt(x.id) - BigInt(y.id)))
        const near = (
          anchor: { id: string; position: number },
          direction: "before" | "after",
          excludeItemId?: string,
        ) =>
          database().transaction((tx) =>
            pipelineItemRepository.neighbour(
              { ...scope(), anchor, direction, excludeItemId },
              tx,
            ),
          )

        expect(await near({ id: a.id, position: 10 }, "before")).toBeNull()
        expect(await near({ id: a.id, position: 10 }, "after")).toEqual({
          id: tied[0].id,
          position: 20,
        })
        expect(await near({ id: tied[0].id, position: 20 }, "after")).toEqual({
          id: tied[1].id,
          position: 20,
        })
        expect(await near({ id: tied[1].id, position: 20 }, "before")).toEqual({
          id: tied[0].id,
          position: 20,
        })
        expect(await near({ id: d.id, position: 30 }, "after")).toBeNull()
        expect(await near({ id: d.id, position: 30 }, "before")).toEqual({
          id: tied[1].id,
          position: 20,
        })
        expect(
          await near({ id: d.id, position: 30 }, "before", tied[1].id),
        ).toEqual({ id: tied[0].id, position: 20 })
        // The anchor never neighbours itself, and other stages are not read.
        await insertAt(25, stage(1))
        expect(await near({ id: tied[1].id, position: 20 }, "after")).toEqual({
          id: d.id,
          position: 30,
        })
      })

      describe("listRespaceWindow", () => {
        const seedSeven = async () =>
          await insertAll([10, 20, 30, 40, 50, 60, 70])
        const window = (input: {
          lower: { id: string; position: number } | null
          upper: { id: string; position: number } | null
          belowLimit: number
          aboveLimit: number
          excludeItemId?: string
        }) =>
          database().transaction((tx) =>
            pipelineItemRepository.listRespaceWindow(
              { ...scope(), ...input },
              tx,
            ),
          )
        const anchorOf = (row: { id: string; position: number }) => ({
          id: row.id,
          position: row.position,
        })

        test("reads rows on both sides of the slot with the bound just outside each", async () => {
          const rows = await seedSeven()

          const result = await window({
            lower: anchorOf(rows[2]),
            upper: anchorOf(rows[3]),
            belowLimit: 2,
            aboveLimit: 2,
          })

          expect(result.below.map((row) => row.position)).toEqual([20, 30])
          expect(result.above.map((row) => row.position)).toEqual([40, 50])
          expect(result.lowerBound).toBe(10)
          expect(result.upperBound).toBe(60)
        })

        test("has no bound where the stage ends inside the window", async () => {
          const rows = await seedSeven()

          const result = await window({
            lower: anchorOf(rows[2]),
            upper: anchorOf(rows[3]),
            belowLimit: 3,
            aboveLimit: 4,
          })

          expect(result.below.map((row) => row.position)).toEqual([10, 20, 30])
          expect(result.above.map((row) => row.position)).toEqual([
            40, 50, 60, 70,
          ])
          expect(result.lowerBound).toBeNull()
          expect(result.upperBound).toBeNull()
        })

        test("reads only the upper side for a slot at the top", async () => {
          const rows = await seedSeven()

          const result = await window({
            lower: null,
            upper: anchorOf(rows[0]),
            belowLimit: 5,
            aboveLimit: 2,
          })

          expect(result.below).toEqual([])
          expect(result.lowerBound).toBeNull()
          expect(result.above.map((row) => row.position)).toEqual([10, 20])
          expect(result.upperBound).toBe(30)
        })

        test("reads only the lower side for a slot at the bottom", async () => {
          const rows = await seedSeven()

          const result = await window({
            lower: anchorOf(rows[6]),
            upper: null,
            belowLimit: 2,
            aboveLimit: 5,
          })

          expect(result.above).toEqual([])
          expect(result.upperBound).toBeNull()
          expect(result.below.map((row) => row.position)).toEqual([60, 70])
          expect(result.lowerBound).toBe(50)
        })

        test("an empty stage has an empty window", async () => {
          const result = await window({
            lower: null,
            upper: null,
            belowLimit: 5,
            aboveLimit: 5,
          })

          expect(result).toEqual({
            below: [],
            above: [],
            lowerBound: null,
            upperBound: null,
          })
        })

        test("leaves the moved item out, so it is neither window row nor bound", async () => {
          const rows = await seedSeven()

          const result = await window({
            lower: anchorOf(rows[1]),
            upper: anchorOf(rows[3]),
            belowLimit: 1,
            aboveLimit: 1,
            excludeItemId: rows[2].id,
          })

          expect(result.below.map((row) => row.position)).toEqual([20])
          expect(result.above.map((row) => row.position)).toEqual([40])
          expect(result.lowerBound).toBe(10)
          expect(result.upperBound).toBe(50)
        })

        test("orders rows that share a position by id and reads them all", async () => {
          const tied = await insertAll([100, 100, 100, 100])
          const sorted = [...tied].sort((a, b) =>
            Number(BigInt(a.id) - BigInt(b.id)),
          )

          const result = await window({
            lower: anchorOf(sorted[1]),
            upper: anchorOf(sorted[2]),
            belowLimit: 5,
            aboveLimit: 5,
          })

          expect(result.below.map((row) => row.id)).toEqual([
            sorted[0].id,
            sorted[1].id,
          ])
          expect(result.above.map((row) => row.id)).toEqual([
            sorted[2].id,
            sorted[3].id,
          ])
        })

        test("bounds the whole window, not each side, to RESPACE_EXISTING_MAX rows", async () => {
          await client.query(
            `INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt","position") SELECT 880000 + g, $1, $2, $3, $4, 880000 + g, 'bulk', 'open', 'medium', '{}', now(), now(), g FROM generate_series(1, 700) AS g`,
            [own.workspaceId, own.pipelineId, stage(0), own.contactIds[0]],
          )
          const at = (position: number) => ({
            id: String(880_000 + position),
            position,
          })

          const result = await window({
            lower: at(500),
            upper: at(501),
            belowLimit: 400,
            aboveLimit: 400,
          })

          expect(result.below).toHaveLength(400)
          expect(result.above).toHaveLength(RESPACE_EXISTING_MAX - 400)
          expect(result.below.length + result.above.length).toBe(
            RESPACE_EXISTING_MAX,
          )
          expect(result.lowerBound).toBe(500 - 400)
        })

        test("never reads another stage's rows and clamps an oversized limit", async () => {
          const rows = await seedSeven()
          await insertAt(15, stage(1))

          const result = await window({
            lower: anchorOf(rows[0]),
            upper: anchorOf(rows[1]),
            belowLimit: 1,
            aboveLimit: 1_000_000,
          })

          expect(result.below.map((row) => row.position)).toEqual([10])
          expect(result.above).toHaveLength(6)
        })
      })

      describe("setPositions", () => {
        const setPositions = (
          rows: { id: string; position: number }[],
          stageId: string = stage(0),
          fixture: Fixture = own,
        ) =>
          database().transaction((tx) =>
            pipelineItemRepository.setPositions(
              {
                workspaceId: fixture.workspaceId,
                pipelineId: fixture.pipelineId,
                stageId,
                rows,
              },
              tx,
            ),
          )

        test("writes every row in one call and leaves updatedAt alone", async () => {
          const rows = await insertAll([1, 2, 3, 4])
          const old = new Date("2026-01-02T03:04:05.678Z")
          await client.query(
            `UPDATE "PipelineItem" SET "updatedAt" = $1 WHERE "stageId" = $2`,
            [old, stage(0)],
          )

          const written = await setPositions(
            rows.map((row, index) => ({
              id: row.id,
              position: -(index + 1) * 0.5,
            })),
          )
          const after = await readPositions(rows.map((row) => row.id))

          expect(written).toBe(4)
          expect(rows.map((row) => after.get(row.id)?.position)).toEqual([
            -0.5, -1, -1.5, -2,
          ])
          expect(
            rows.every((row) => +(after.get(row.id)?.updatedAt ?? 0) === +old),
          ).toBe(true)
        })

        test("does nothing for an empty list", async () => {
          expect(await setPositions([])).toBe(0)
        })

        test("tolerates a row deleted meanwhile and writes the rest", async () => {
          const [keep, gone] = await insertAll([1, 2])
          await pipelineItemRepository.delete({
            workspaceId: own.workspaceId,
            id: gone.id,
          })

          const written = await setPositions([
            { id: keep.id, position: 11 },
            { id: gone.id, position: 12 },
          ])

          expect(written).toBe(1)
          expect((await readPositions([keep.id])).get(keep.id)?.position).toBe(
            11,
          )
        })

        test("never writes a row of another workspace", async () => {
          const foreign = await insertItem(other, { position: 5 })

          const written = await setPositions(
            [{ id: foreign.id, position: 99 }],
            stage(0),
          )

          expect(written).toBe(0)
          expect(
            (await readPositions([foreign.id])).get(foreign.id)?.position,
          ).toBe(5)
        })

        test("never writes a row of another stage", async () => {
          const here = await insertAt(1)
          const elsewhere = await insertAt(2, stage(1))

          const written = await setPositions([
            { id: here.id, position: 11 },
            { id: elsewhere.id, position: 22 },
          ])
          const after = await readPositions([here.id, elsewhere.id])

          expect(written).toBe(1)
          expect(after.get(here.id)?.position).toBe(11)
          expect(after.get(elsewhere.id)?.position).toBe(2)
        })

        test("rejects more rows than a respace may rewrite", async () => {
          const rows = Array.from(
            { length: RESPACE_EXISTING_MAX + 2 },
            (_, index) => ({ id: String(index + 1), position: index }),
          )

          await expect(setPositions(rows)).rejects.toThrow(RangeError)
        })

        test("rejects a non-finite position before touching the database", async () => {
          const row = await insertAt(1)

          await expect(
            setPositions([{ id: row.id, position: Number.NaN }]),
          ).rejects.toThrow(RangeError)
          await expect(
            setPositions([{ id: row.id, position: Number.POSITIVE_INFINITY }]),
          ).rejects.toThrow(RangeError)
          expect((await readPositions([row.id])).get(row.id)?.position).toBe(1)
        })

        test("rolls every row back with the transaction", async () => {
          const rows = await insertAll([1, 2])
          const db = database()

          await expect(
            db.transaction(async (tx) => {
              await pipelineItemRepository.setPositions(
                {
                  ...scope(),
                  rows: rows.map((row) => ({ id: row.id, position: 500 })),
                },
                tx,
              )
              throw new Error("abort")
            }),
          ).rejects.toThrow("abort")

          const after = await readPositions(rows.map((row) => row.id))
          expect(rows.map((row) => after.get(row.id)?.position)).toEqual([1, 2])
        })
      })
    })

    describe("index use", () => {
      const explain = async (sort: typeof sortAsc | typeof sortDesc) => {
        const captured: { params: unknown[]; query: string }[] = []
        const logged = drizzle({
          client,
          logger: {
            logQuery: (query, params) => captured.push({ params, query }),
          },
          relations,
          schema,
        })
        await pipelineItemRepository.listStagePage(
          { ...scope(), sort, limit: 10 },
          logged as unknown as Parameters<
            typeof pipelineItemRepository.listStagePage
          >[1],
        )
        const statement = captured.at(-1)
        if (!statement) {
          throw new Error("the list query was not captured")
        }
        // Forbid sorting, table scans and bitmaps: a plan only exists if the
        // index already yields the ORDER BY, whatever the table size.
        await client.query("BEGIN")
        try {
          await client.query("SET LOCAL enable_sort = off")
          await client.query("SET LOCAL enable_seqscan = off")
          await client.query("SET LOCAL enable_bitmapscan = off")
          const plan = await client.query<{ "QUERY PLAN": unknown }>(
            `EXPLAIN (FORMAT JSON) ${statement.query}`,
            statement.params,
          )
          return JSON.stringify(plan.rows[0]?.["QUERY PLAN"])
        } finally {
          await client.query("ROLLBACK")
        }
      }

      test.each([
        ["asc", false],
        ["desc", true],
      ] as const)("manual %s reads the (position, id) index with no Sort node", async (direction, backward) => {
        const plan = await explain({ key: "manual", direction })

        expect(plan).toContain(POSITION_INDEX)
        expect(plan).not.toContain('"Node Type":"Sort"')
        expect(plan.includes('"Scan Direction":"Backward"')).toBe(backward)
      })
    })
  })
})
