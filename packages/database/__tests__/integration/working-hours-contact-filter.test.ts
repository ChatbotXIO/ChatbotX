// @vitest-environment node

/**
 * `isWithinWorkingHours` contact-filter predicate against a real Postgres.
 * Schedules are either open every minute of every day or have no intervals, so
 * the outcome never depends on the wall clock the suite runs at. Every test
 * seeds inside a transaction that is always rolled back.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { buildContactWhere } from "../../src/queries/contact-filter"
import { relations } from "../../src/relations"
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
      email: `whf-${label}-${Date.now()}-${Math.random()}@example.test`,
    })
    .returning({ id: schema.userModel.id })
  return user.id
}

const seedWorkspace = async (tx: DatabaseClient, timezone = "UTC") => {
  const ownerId = await seedUser(tx, "owner")
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: "whf", ownerId, timezone })
    .returning({ id: schema.workspaceModel.id })
  return { workspaceId: workspace.id, ownerId }
}

const seedSchedule = async (
  tx: DatabaseClient,
  workspaceId: string,
  open: boolean,
  memberUserId?: string,
) => {
  const [schedule] = await tx
    .insert(schema.workingHoursModel)
    .values({ workspaceId, name: open ? "Always open" : "Always closed" })
    .returning({ id: schema.workingHoursModel.id })
  if (open) {
    await tx.insert(schema.workingHoursIntervalModel).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        workingHoursId: schedule.id,
        weekday,
        startMinute: 0,
        endMinute: 1440,
      })),
    )
  }
  if (memberUserId) {
    await tx.insert(schema.workingHoursMemberModel).values({
      workingHoursId: schedule.id,
      workspaceId,
      userId: memberUserId,
    })
  }
  return schedule.id
}

const seedContact = async (
  tx: DatabaseClient,
  workspaceId: string,
  assignedUserId?: string,
) => {
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({ workspaceId })
    .returning({ id: schema.contactModel.id })
  await tx
    .insert(schema.conversationModel)
    .values({ workspaceId, contactId: contact.id, assignedUserId })
  return contact.id
}

describe.skipIf(!databaseUrl)(
  "isWithinWorkingHours contact filter against Postgres",
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

    const matches = async (
      tx: DatabaseClient,
      workspaceId: string,
      contactId: string,
      operator: "in" | "notIn",
      value: string[],
      workingHoursTimezone?: string,
    ) => {
      const where = buildContactWhere({
        workspaceId,
        contactFilter: {
          operator: "and",
          conditions: [{ field: "isWithinWorkingHours", operator, value }],
          workingHoursTimezone,
        },
      })
      const rows = await tx.query.contactModel.findMany({
        where: { ...where, id: contactId },
        columns: { id: true },
      })
      return rows.length === 1
    }

    test("a schedule open now matches `in`, and `notIn` excludes it", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const open = await seedSchedule(tx, workspaceId, true)
        const contactId = await seedContact(tx, workspaceId)

        expect(await matches(tx, workspaceId, contactId, "in", [open])).toBe(
          true,
        )
        expect(await matches(tx, workspaceId, contactId, "notIn", [open])).toBe(
          false,
        )
      }))

    test("a schedule without intervals is closed", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const closed = await seedSchedule(tx, workspaceId, false)
        const contactId = await seedContact(tx, workspaceId)

        expect(await matches(tx, workspaceId, contactId, "in", [closed])).toBe(
          false,
        )
        expect(
          await matches(tx, workspaceId, contactId, "notIn", [closed]),
        ).toBe(true)
      }))

    test("an unknown timezone falls back to UTC instead of throwing", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const open = await seedSchedule(tx, workspaceId, true)
        const contactId = await seedContact(tx, workspaceId)

        expect(
          await matches(tx, workspaceId, contactId, "in", [open], "Not/AZone"),
        ).toBe(true)
      }))

    test("a real non-UTC timezone is accepted", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const open = await seedSchedule(tx, workspaceId, true)
        const contactId = await seedContact(tx, workspaceId)

        expect(
          await matches(
            tx,
            workspaceId,
            contactId,
            "in",
            [open],
            "Asia/Ho_Chi_Minh",
          ),
        ).toBe(true)
      }))

    test("a schedule of another workspace never matches", () =>
      run(async (tx) => {
        const first = await seedWorkspace(tx)
        const second = await seedWorkspace(tx)
        const foreignOpen = await seedSchedule(tx, second.workspaceId, true)
        const contactId = await seedContact(tx, first.workspaceId)

        expect(
          await matches(tx, first.workspaceId, contactId, "in", [foreignOpen]),
        ).toBe(false)
      }))

    test("assignedAgent: on-shift agent matches; off-shift, unassigned do not; unscheduled agent counts as on shift", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const onShiftAgent = await seedUser(tx, "on")
        const offShiftAgent = await seedUser(tx, "off")
        const unscheduledAgent = await seedUser(tx, "free")
        await seedSchedule(tx, workspaceId, true, onShiftAgent)
        await seedSchedule(tx, workspaceId, false, offShiftAgent)

        const onShiftContact = await seedContact(tx, workspaceId, onShiftAgent)
        const offShiftContact = await seedContact(
          tx,
          workspaceId,
          offShiftAgent,
        )
        const unscheduledContact = await seedContact(
          tx,
          workspaceId,
          unscheduledAgent,
        )
        const unassignedContact = await seedContact(tx, workspaceId)
        const assigned = ["assignedAgent"]

        expect(
          await matches(tx, workspaceId, onShiftContact, "in", assigned),
        ).toBe(true)
        expect(
          await matches(tx, workspaceId, offShiftContact, "in", assigned),
        ).toBe(false)
        expect(
          await matches(tx, workspaceId, unscheduledContact, "in", assigned),
        ).toBe(true)
        expect(
          await matches(tx, workspaceId, unassignedContact, "in", assigned),
        ).toBe(false)
        expect(
          await matches(tx, workspaceId, offShiftContact, "notIn", assigned),
        ).toBe(true)
        expect(
          await matches(tx, workspaceId, unassignedContact, "notIn", assigned),
        ).toBe(true)
      }))

    test("a selection with an unknown schedule id and no assignedAgent is a no-op", () =>
      run(async (tx) => {
        const { workspaceId } = await seedWorkspace(tx)
        const contactId = await seedContact(tx, workspaceId)
        const where = buildContactWhere({
          workspaceId,
          contactFilter: {
            operator: "and",
            conditions: [
              {
                field: "isWithinWorkingHours",
                operator: "in",
                value: ["not-a-number"],
              },
            ],
          },
        })
        const rows = await tx.query.contactModel.findMany({
          where: { ...where, id: contactId },
          columns: { id: true },
        })
        expect(rows).toHaveLength(1)
      }))

    describe("date overrides", () => {
      const today = () => new Date().toISOString().slice(0, 10)

      const addOverride = async (
        tx: DatabaseClient,
        workspaceId: string,
        workingHoursId: string | null,
        open: boolean,
      ) => {
        await tx.insert(schema.workingHoursDateOverrideModel).values({
          workspaceId,
          workingHoursId,
          date: today(),
          ranges: open ? [{ startMinute: 0, endMinute: 1440 }] : [],
        })
      }

      test("a workspace holiday closes an always-open schedule", () =>
        run(async (tx) => {
          const { workspaceId } = await seedWorkspace(tx)
          const open = await seedSchedule(tx, workspaceId, true)
          const contactId = await seedContact(tx, workspaceId)
          await addOverride(tx, workspaceId, null, false)

          expect(await matches(tx, workspaceId, contactId, "in", [open])).toBe(
            false,
          )
          expect(
            await matches(tx, workspaceId, contactId, "notIn", [open]),
          ).toBe(true)
        }))

      test("a holiday with hours opens an always-closed schedule", () =>
        run(async (tx) => {
          const { workspaceId } = await seedWorkspace(tx)
          const closed = await seedSchedule(tx, workspaceId, false)
          const contactId = await seedContact(tx, workspaceId)
          await addOverride(tx, workspaceId, null, true)

          expect(
            await matches(tx, workspaceId, contactId, "in", [closed]),
          ).toBe(true)
        }))

      test("the schedule's own override wins over the workspace holiday", () =>
        run(async (tx) => {
          const { workspaceId } = await seedWorkspace(tx)
          const open = await seedSchedule(tx, workspaceId, true)
          const contactId = await seedContact(tx, workspaceId)
          await addOverride(tx, workspaceId, null, false)
          await addOverride(tx, workspaceId, open, true)

          expect(await matches(tx, workspaceId, contactId, "in", [open])).toBe(
            true,
          )
        }))

      test("assignedAgent follows the overridden schedule", () =>
        run(async (tx) => {
          const { workspaceId } = await seedWorkspace(tx)
          const agent = await seedUser(tx, "ag")
          await seedSchedule(tx, workspaceId, true, agent)
          const contactId = await seedContact(tx, workspaceId, agent)
          await addOverride(tx, workspaceId, null, false)

          expect(
            await matches(tx, workspaceId, contactId, "in", ["assignedAgent"]),
          ).toBe(false)
        }))

      test("another workspace's holiday is ignored", () =>
        run(async (tx) => {
          const first = await seedWorkspace(tx)
          const second = await seedWorkspace(tx)
          const open = await seedSchedule(tx, first.workspaceId, true)
          const contactId = await seedContact(tx, first.workspaceId)
          await addOverride(tx, second.workspaceId, null, false)

          expect(
            await matches(tx, first.workspaceId, contactId, "in", [open]),
          ).toBe(true)
        }))
    })
  },
)
