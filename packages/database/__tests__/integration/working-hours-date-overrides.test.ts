// @vitest-environment node

/**
 * Date overrides / holidays against a real Postgres: the row limit and full
 * replacement under concurrent writers (three committed connections, fixture
 * deleted in `afterAll`), uniqueness per scope, and cascade on schedule delete.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { WORKING_HOURS_MAX_DATE_OVERRIDES } from "../../src/partials/working-hours"
import { relations } from "../../src/relations"
import { workingHoursRepository } from "../../src/repositories/working-hours/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const dateOf = (offset: number) =>
  new Date(Date.UTC(2030, 0, 1 + offset)).toISOString().slice(0, 10)

describe.skipIf(!databaseUrl)(
  "working hours date overrides against Postgres",
  () => {
    const clients: Client[] = []
    let dbs: ReturnType<typeof createDatabase>[] = []
    let workspaceId: string
    let ownerId: string
    let scheduleId: string

    beforeAll(async () => {
      for (let index = 0; index < 3; index += 1) {
        const client = new Client({ connectionString: databaseUrl as string })
        await client.connect()
        clients.push(client)
      }
      dbs = clients.map(createDatabase)
      const [user] = await dbs[0]
        .insert(schema.userModel)
        .values({ email: `whd-${Date.now()}-${Math.random()}@example.test` })
        .returning({ id: schema.userModel.id })
      ownerId = user.id
      const [workspace] = await dbs[0]
        .insert(schema.workspaceModel)
        .values({ name: "whd", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      const [schedule] = await dbs[0]
        .insert(schema.workingHoursModel)
        .values({ workspaceId, name: "Office" })
        .returning({ id: schema.workingHoursModel.id })
      scheduleId = schedule.id
    })

    afterAll(async () => {
      await dbs[0]
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await dbs[0]
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, ownerId))
      await Promise.all(clients.map((client) => client.end()))
    })

    const holiday = (offset: number) => ({
      date: dateOf(offset),
      name: null,
      ranges: [],
    })

    test("a closed day is stored as an explicit empty list and a date is unique per scope", async () => {
      const first = await workingHoursRepository.addDateOverride(
        {
          workspaceId,
          workingHoursId: null,
          override: { date: dateOf(0), name: "New year", ranges: [] },
        },
        dbs[0],
      )
      expect(first.status).toBe("ok")
      const rows = await workingHoursRepository.listDateOverrides(
        { workspaceId, workingHoursId: null },
        dbs[0],
      )
      expect(rows.map((row) => row.ranges)).toEqual([[]])

      const duplicate = await workingHoursRepository.addDateOverride(
        { workspaceId, workingHoursId: null, override: holiday(0) },
        dbs[0],
      )
      expect(duplicate.status).toBe("duplicate")

      // The same date on a schedule is a different scope.
      const own = await workingHoursRepository.addDateOverride(
        {
          workspaceId,
          workingHoursId: scheduleId,
          override: {
            date: dateOf(0),
            ranges: [{ startMinute: 0, endMinute: 60 }],
          },
        },
        dbs[0],
      )
      expect(own.status).toBe("ok")
    })

    test("an unknown schedule reports notFound", async () => {
      const result = await workingHoursRepository.addDateOverride(
        {
          workspaceId,
          workingHoursId: "999999999999999999",
          override: holiday(5),
        },
        dbs[0],
      )
      expect(result.status).toBe("notFound")
    })

    test("concurrent adds can never exceed the row limit", async () => {
      await workingHoursRepository.replaceDateOverrides(
        {
          workspaceId,
          workingHoursId: null,
          overrides: Array.from(
            { length: WORKING_HOURS_MAX_DATE_OVERRIDES - 1 },
            (_, index) => holiday(100 + index),
          ),
        },
        dbs[0],
      )

      const results = await Promise.all(
        [0, 1, 2].map((index) =>
          workingHoursRepository.addDateOverride(
            {
              workspaceId,
              workingHoursId: null,
              override: holiday(1000 + index),
            },
            dbs[index],
          ),
        ),
      )

      expect(results.filter((result) => result.status === "ok")).toHaveLength(1)
      expect(
        results.filter((result) => result.status === "limitReached"),
      ).toHaveLength(2)
      const rows = await workingHoursRepository.listDateOverrides(
        { workspaceId, workingHoursId: null },
        dbs[0],
      )
      expect(rows).toHaveLength(WORKING_HOURS_MAX_DATE_OVERRIDES)
    })

    test("concurrent full replacements never interleave", async () => {
      const setA = Array.from({ length: 5 }, (_, index) =>
        holiday(2000 + index),
      )
      const setB = Array.from({ length: 7 }, (_, index) =>
        holiday(3000 + index),
      )

      await Promise.all([
        workingHoursRepository.replaceDateOverrides(
          { workspaceId, workingHoursId: null, overrides: setA },
          dbs[0],
        ),
        workingHoursRepository.replaceDateOverrides(
          { workspaceId, workingHoursId: null, overrides: setB },
          dbs[1],
        ),
      ])

      const rows = await workingHoursRepository.listDateOverrides(
        { workspaceId, workingHoursId: null },
        dbs[0],
      )
      const dates = rows.map((row) => row.date)
      const isSetA = dates.length === 5 && dates[0] === setA[0].date
      const isSetB = dates.length === 7 && dates[0] === setB[0].date
      expect(isSetA || isSetB).toBe(true)
    })

    test("the range read returns every scope's rows inside the span only", async () => {
      await workingHoursRepository.replaceDateOverrides(
        {
          workspaceId,
          workingHoursId: null,
          overrides: [holiday(10), holiday(20)],
        },
        dbs[0],
      )
      await workingHoursRepository.replaceDateOverrides(
        { workspaceId, workingHoursId: scheduleId, overrides: [holiday(11)] },
        dbs[0],
      )

      const rows = await workingHoursRepository.listDateOverridesInRange(
        { workspaceId, from: dateOf(9), to: dateOf(12) },
        dbs[0],
      )

      expect(rows.map((row) => row.date)).toEqual([dateOf(10), dateOf(11)])
    })

    test("deleting the schedule removes its overrides but keeps the holidays", async () => {
      await workingHoursRepository.delete(
        { workspaceId, id: scheduleId },
        dbs[0],
      )

      const own = await dbs[0]
        .select()
        .from(schema.workingHoursDateOverrideModel)
        .where(
          eq(schema.workingHoursDateOverrideModel.workingHoursId, scheduleId),
        )
      const holidays = await workingHoursRepository.listDateOverrides(
        { workspaceId, workingHoursId: null },
        dbs[0],
      )
      expect(own).toHaveLength(0)
      expect(holidays.length).toBeGreaterThan(0)
    })
  },
)
