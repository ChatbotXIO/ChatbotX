// @vitest-environment node

/**
 * Deadlock regression for `workingHoursRepository.replaceMembers`: two saves of
 * different schedules that move the same users in opposite orders must both
 * succeed (the per-workspace advisory lock serializes them). Needs two
 * committed connections, so the fixture is committed and deleted in `afterAll`
 * (workspace deletion cascades).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { workingHoursRepository } from "../../src/repositories/working-hours/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const ROUNDS = 20

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)(
  "workingHoursRepository.replaceMembers concurrent saves",
  () => {
    let clientA: Client
    let clientB: Client
    let dbA: ReturnType<typeof createDatabase>
    let dbB: ReturnType<typeof createDatabase>
    let workspaceId: string
    let ownerId: string
    let userIds: string[]
    let scheduleIds: string[]

    beforeAll(async () => {
      clientA = new Client({ connectionString: databaseUrl as string })
      clientB = new Client({ connectionString: databaseUrl as string })
      await Promise.all([clientA.connect(), clientB.connect()])
      dbA = createDatabase(clientA)
      dbB = createDatabase(clientB)
      const stamp = `${Date.now()}-${Math.random()}`
      const users = await dbA
        .insert(schema.userModel)
        .values(
          ["owner", "u1", "u2", "u3"].map((label) => ({
            email: `whc-${label}-${stamp}@example.test`,
          })),
        )
        .returning({ id: schema.userModel.id })
      ownerId = users[0].id
      userIds = users.slice(1).map((user) => user.id)
      const [workspace] = await dbA
        .insert(schema.workspaceModel)
        .values({ name: "whc", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      await dbA.insert(schema.workspaceMemberModel).values(
        userIds.map((userId) => ({
          workspaceId,
          userId,
          role: "agent" as const,
          notificationChannels: {},
          notificationTypes: {},
          permissions: {},
        })),
      )
      const schedules = await dbA
        .insert(schema.workingHoursModel)
        .values([
          { workspaceId, name: "A" },
          { workspaceId, name: "B" },
        ])
        .returning({ id: schema.workingHoursModel.id })
      scheduleIds = schedules.map((schedule) => schedule.id)
    })

    afterAll(async () => {
      await dbA
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      for (const userId of [...userIds, ownerId]) {
        await dbA
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, userId))
      }
      await Promise.all([clientA.end(), clientB.end()])
    })

    test("opposite-order moves of the same users on two schedules never deadlock", async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        const [first, second] = await Promise.all([
          workingHoursRepository.replaceMembers(
            {
              workspaceId,
              workingHoursId: scheduleIds[0],
              userIds: [...userIds],
            },
            dbA,
          ),
          workingHoursRepository.replaceMembers(
            {
              workspaceId,
              workingHoursId: scheduleIds[1],
              userIds: [...userIds].reverse(),
            },
            dbB,
          ),
        ])

        expect(first.status).toBe("ok")
        expect(second.status).toBe("ok")
      }
    })

    const OLD = new Date("2000-01-01T00:00:00Z")
    const updatedAtOf = async (id: string) => {
      const [row] = await dbA
        .select({ updatedAt: schema.workingHoursModel.updatedAt })
        .from(schema.workingHoursModel)
        .where(eq(schema.workingHoursModel.id, id))
      return row.updatedAt
    }
    const ageSchedules = async () => {
      await dbA
        .update(schema.workingHoursModel)
        .set({ updatedAt: OLD })
        .where(inArray(schema.workingHoursModel.id, scheduleIds))
    }

    test("moving a member bumps the schedule that lost them", async () => {
      await workingHoursRepository.replaceMembers(
        { workspaceId, workingHoursId: scheduleIds[0], userIds: [userIds[0]] },
        dbA,
      )
      await ageSchedules()

      await workingHoursRepository.replaceMembers(
        { workspaceId, workingHoursId: scheduleIds[1], userIds: [userIds[0]] },
        dbA,
      )

      expect((await updatedAtOf(scheduleIds[0])).getTime()).toBeGreaterThan(
        OLD.getTime(),
      )
      expect((await updatedAtOf(scheduleIds[1])).getTime()).toBeGreaterThan(
        OLD.getTime(),
      )
    })

    test("removing a workspace member bumps the schedule they were on", async () => {
      await workingHoursRepository.replaceMembers(
        { workspaceId, workingHoursId: scheduleIds[0], userIds: [userIds[1]] },
        dbA,
      )
      await ageSchedules()

      await workingHoursRepository.deleteMembersForUsers(
        { workspaceId, userIds: [userIds[1]] },
        dbA,
      )

      expect((await updatedAtOf(scheduleIds[0])).getTime()).toBeGreaterThan(
        OLD.getTime(),
      )
      expect((await updatedAtOf(scheduleIds[1])).getTime()).toBe(OLD.getTime())
    })

    test("moving a member while their old schedule is deleted never deadlocks", async () => {
      const [target] = await dbA
        .insert(schema.workingHoursModel)
        .values({ workspaceId, name: "target" })
        .returning({ id: schema.workingHoursModel.id })
      for (let round = 0; round < ROUNDS; round += 1) {
        const [old] = await dbA
          .insert(schema.workingHoursModel)
          .values({ workspaceId, name: `old-${round}` })
          .returning({ id: schema.workingHoursModel.id })
        await workingHoursRepository.replaceMembers(
          { workspaceId, workingHoursId: old.id, userIds: [userIds[2]] },
          dbA,
        )

        const [moved, deleted] = await Promise.allSettled([
          workingHoursRepository.replaceMembers(
            {
              workspaceId,
              workingHoursId: target.id,
              userIds: [userIds[2]],
            },
            dbA,
          ),
          workingHoursRepository.delete({ workspaceId, id: old.id }, dbB),
        ])

        // 40P01 (deadlock_detected) must never surface; both settle cleanly.
        expect(moved.status).toBe("fulfilled")
        expect(deleted.status).toBe("fulfilled")
        if (moved.status === "fulfilled") {
          expect(moved.value.status).toBe("ok")
        }
      }
    })
  },
)
