// @vitest-environment node

/**
 * Working-hours constraints against a real Postgres: the interval CHECKs, the
 * composite (workingHoursId, workspaceId) foreign key, the one-schedule-per-
 * member unique key, and the `replaceMembers` move. Every test seeds inside a
 * transaction that is always rolled back.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { workingHoursRepository } from "../../src/repositories/working-hours/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

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

const seedUser = async (tx: DatabaseClient, label: string) => {
  const [user] = await tx
    .insert(schema.userModel)
    .values({
      email: `wh-${label}-${Date.now()}-${Math.random()}@example.test`,
    })
    .returning({ id: schema.userModel.id })
  return user.id
}

const seedMember = async (
  tx: DatabaseClient,
  workspaceId: string,
  userId: string,
  role: "owner" | "agent" = "agent",
) => {
  await tx.insert(schema.workspaceMemberModel).values({
    workspaceId,
    userId,
    role,
    notificationChannels: {},
    notificationTypes: {},
    permissions: {},
  })
}

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const ownerId = await seedUser(tx, `owner-${label}`)
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `wh-${label}`, ownerId })
    .returning({ id: schema.workspaceModel.id })
  await seedMember(tx, workspace.id, ownerId, "owner")
  return { workspaceId: workspace.id, ownerId }
}

/**
 * A failing statement aborts the surrounding transaction, so each expected
 * failure runs inside its own savepoint.
 */
const expectConstraintViolation = async (
  tx: DatabaseClient,
  statement: (inner: DatabaseClient) => Promise<unknown>,
  constraint: string,
) => {
  let message = ""
  try {
    await tx.transaction(async (inner) => {
      await statement(inner)
    })
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause
    message = cause?.constraint ?? String(error)
  }
  expect(message).toContain(constraint)
}

describe.skipIf(!databaseUrl)(
  "working hours constraints against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const run = (fn: (tx: DatabaseClient) => Promise<void>) =>
      withRolledBackTransaction(createDatabase(client), fn)

    const insertInterval = (
      tx: DatabaseClient,
      workingHoursId: string,
      weekday: number,
      startMinute: number,
      endMinute: number,
    ) =>
      tx
        .insert(schema.workingHoursIntervalModel)
        .values({ workingHoursId, weekday, startMinute, endMinute })

    test("interval CHECKs accept 00:00-24:00 and reject out-of-range or empty ranges", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx, "check")
        const schedule = await workingHoursRepository.create(
          { workspaceId, name: "Office" },
          tx,
        )

        await insertInterval(tx, schedule.id, 0, 0, 1440)
        await insertInterval(tx, schedule.id, 6, 1439, 1440)

        await expectConstraintViolation(
          tx,
          (inner) => insertInterval(inner, schedule.id, 7, 0, 60),
          "WorkingHoursInterval_weekday_check",
        )
        await expectConstraintViolation(
          tx,
          (inner) => insertInterval(inner, schedule.id, 1, 60, 60),
          "WorkingHoursInterval_minutes_check",
        )
        await expectConstraintViolation(
          tx,
          (inner) => insertInterval(inner, schedule.id, 1, 0, 1441),
          "WorkingHoursInterval_minutes_check",
        )
        await expectConstraintViolation(
          tx,
          (inner) => insertInterval(inner, schedule.id, 1, -1, 60),
          "WorkingHoursInterval_minutes_check",
        )
      }))

    test("the composite FK rejects a member whose workspaceId differs from the schedule's", () =>
      run(async (tx) => {
        const a = await seedWorkspace(tx, "fk-a")
        const b = await seedWorkspace(tx, "fk-b")
        const schedule = await workingHoursRepository.create(
          { workspaceId: a.workspaceId, name: "Office" },
          tx,
        )

        await expectConstraintViolation(
          tx,
          (inner) =>
            inner.insert(schema.workingHoursMemberModel).values({
              workingHoursId: schedule.id,
              workspaceId: b.workspaceId,
              userId: b.ownerId,
            }),
          "WorkingHoursMember_workingHoursId_workspaceId_fkey",
        )
      }))

    test("a user has at most one schedule per workspace", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "unique")
        const first = await workingHoursRepository.create(
          { workspaceId, name: "A" },
          tx,
        )
        const second = await workingHoursRepository.create(
          { workspaceId, name: "B" },
          tx,
        )
        await tx.insert(schema.workingHoursMemberModel).values({
          workingHoursId: first.id,
          workspaceId,
          userId: ownerId,
        })

        await expectConstraintViolation(
          tx,
          (inner) =>
            inner.insert(schema.workingHoursMemberModel).values({
              workingHoursId: second.id,
              workspaceId,
              userId: ownerId,
            }),
          "WorkingHoursMember_workspaceId_userId_key",
        )
      }))

    test("replaceMembers moves a user from another schedule and prunes removed members", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "move")
        const otherUserId = await seedUser(tx, "other")
        await seedMember(tx, workspaceId, otherUserId)
        const first = await workingHoursRepository.create(
          { workspaceId, name: "A" },
          tx,
        )
        const second = await workingHoursRepository.create(
          { workspaceId, name: "B" },
          tx,
        )

        await workingHoursRepository.replaceMembers(
          {
            workspaceId,
            workingHoursId: first.id,
            userIds: [ownerId, otherUserId],
          },
          tx,
        )
        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId: second.id, userIds: [ownerId] },
          tx,
        )

        const onFirst = await workingHoursRepository.findById(
          { workspaceId, id: first.id },
          tx,
        )
        const onSecond = await workingHoursRepository.findById(
          { workspaceId, id: second.id },
          tx,
        )
        expect(onFirst?.members.map((member) => member.userId)).toEqual([
          otherUserId,
        ])
        expect(onSecond?.members.map((member) => member.userId)).toEqual([
          ownerId,
        ])

        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId: second.id, userIds: [] },
          tx,
        )
        expect(
          (
            await workingHoursRepository.findById(
              { workspaceId, id: second.id },
              tx,
            )
          )?.members,
        ).toEqual([])
      }))

    test("replaceIntervals and replaceMembers do not touch a schedule of another workspace", () =>
      run(async (tx) => {
        const a = await seedWorkspace(tx, "scope-a")
        const b = await seedWorkspace(tx, "scope-b")
        const schedule = await workingHoursRepository.create(
          { workspaceId: a.workspaceId, name: "A" },
          tx,
        )

        const intervals = await workingHoursRepository.replaceIntervals(
          {
            workspaceId: b.workspaceId,
            workingHoursId: schedule.id,
            intervals: [{ weekday: 1, startMinute: 0, endMinute: 60 }],
          },
          tx,
        )
        const members = await workingHoursRepository.replaceMembers(
          {
            workspaceId: b.workspaceId,
            workingHoursId: schedule.id,
            userIds: [b.ownerId],
          },
          tx,
        )

        expect([intervals, members]).toEqual([false, { status: "notFound" }])
      }))

    test("replaceMembers rejects a user who is not a workspace member and writes nothing", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "nonmember")
        const stranger = await seedUser(tx, "stranger")
        const schedule = await workingHoursRepository.create(
          { workspaceId, name: "A" },
          tx,
        )
        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId: schedule.id, userIds: [ownerId] },
          tx,
        )

        const result = await workingHoursRepository.replaceMembers(
          {
            workspaceId,
            workingHoursId: schedule.id,
            userIds: [ownerId, stranger],
          },
          tx,
        )

        expect(result).toEqual({ status: "invalidUsers", userIds: [stranger] })
        expect(
          (
            await workingHoursRepository.findById(
              { workspaceId, id: schedule.id },
              tx,
            )
          )?.members.map((member) => member.userId),
        ).toEqual([ownerId])
      }))

    test("deleting a schedule cascades to its intervals and members", () =>
      run(async (tx) => {
        const { workspaceId, ownerId } = await seedWorkspace(tx, "cascade")
        const schedule = await workingHoursRepository.create(
          { workspaceId, name: "A" },
          tx,
        )
        await workingHoursRepository.replaceIntervals(
          {
            workspaceId,
            workingHoursId: schedule.id,
            intervals: [{ weekday: 1, startMinute: 0, endMinute: 60 }],
          },
          tx,
        )
        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId: schedule.id, userIds: [ownerId] },
          tx,
        )

        expect(
          await workingHoursRepository.delete(
            { workspaceId, id: schedule.id },
            tx,
          ),
        ).toBe(true)

        expect(
          await tx
            .select()
            .from(schema.workingHoursIntervalModel)
            .where(
              eq(schema.workingHoursIntervalModel.workingHoursId, schedule.id),
            ),
        ).toEqual([])
        expect(
          await workingHoursRepository.findForUser(
            { workspaceId, userId: ownerId },
            tx,
          ),
        ).toBeUndefined()
      }))
  },
)
