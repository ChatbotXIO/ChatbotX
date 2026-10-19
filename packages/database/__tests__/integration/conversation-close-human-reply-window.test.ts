// @vitest-environment node

/**
 * `closeHumanReplyWindow` against a real Postgres. The concurrency case needs
 * two committed connections, so the fixture is committed and deleted again in
 * `afterAll` (workspace deletion cascades to contact and conversation).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  assignTargetIfUnassigned,
  assignUserIfUnassigned,
  closeHumanReplyWindow,
} from "../../src/repositories/conversation/repository"
import { responseSlaRepository } from "../../src/repositories/response-sla/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const T0 = new Date("2026-10-18T09:00:00.000Z")
const at = (offsetSeconds: number): Date =>
  new Date(T0.getTime() + offsetSeconds * 1000)

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)(
  "conversationRepository.closeHumanReplyWindow against Postgres",
  () => {
    let clientA: Client
    let clientB: Client
    let dbA: ReturnType<typeof createDatabase>
    let dbB: ReturnType<typeof createDatabase>
    let workspaceId: string
    let otherWorkspaceId: string
    let ownerId: string
    let userId: string

    const newConversation = async (
      values: Partial<typeof schema.conversationModel.$inferInsert> = {},
    ): Promise<string> => {
      // One DM conversation per contact, so each case gets its own contact.
      const [contact] = await dbA
        .insert(schema.contactModel)
        .values({ workspaceId })
        .returning({ id: schema.contactModel.id })
      const [conversation] = await dbA
        .insert(schema.conversationModel)
        .values({ workspaceId, contactId: contact.id, ...values })
        .returning({ id: schema.conversationModel.id })
      return conversation.id
    }

    const read = async (id: string) =>
      await dbA.query.conversationModel.findFirst({
        where: { id },
        columns: {
          adminRepliedAt: true,
          awaitingHumanReplySince: true,
          awaitingHumanReplyClosedAt: true,
          assignedUserId: true,
          assignedUserAt: true,
          assignedInboxTeamId: true,
        },
      })

    beforeAll(async () => {
      clientA = new Client({ connectionString: databaseUrl as string })
      clientB = new Client({ connectionString: databaseUrl as string })
      await Promise.all([clientA.connect(), clientB.connect()])
      dbA = createDatabase(clientA)
      dbB = createDatabase(clientB)
      const stamp = `${Date.now()}-${Math.random()}`
      const [owner] = await dbA
        .insert(schema.userModel)
        .values({ email: `chrw-owner-${stamp}@example.test` })
        .returning({ id: schema.userModel.id })
      ownerId = owner.id
      const [agent] = await dbA
        .insert(schema.userModel)
        .values({ email: `chrw-agent-${stamp}@example.test` })
        .returning({ id: schema.userModel.id })
      userId = agent.id
      const [workspace] = await dbA
        .insert(schema.workspaceModel)
        .values({ name: "chrw-a", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      const [other] = await dbA
        .insert(schema.workspaceModel)
        .values({ name: "chrw-b", ownerId })
        .returning({ id: schema.workspaceModel.id })
      otherWorkspaceId = other.id
    })

    afterAll(async () => {
      await dbA
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await dbA
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, otherWorkspaceId))
      await dbA.delete(schema.userModel).where(eq(schema.userModel.id, userId))
      await dbA.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
      await Promise.all([clientA.end(), clientB.end()])
    })

    test("closes an open window, reports its start and records the reply", async () => {
      const id = await newConversation({ awaitingHumanReplySince: T0 })

      const result = await closeHumanReplyWindow(
        { workspaceId, conversationId: id, repliedAt: at(300) },
        dbA,
      )

      expect(result?.closedAwaitingSince?.getTime()).toBe(T0.getTime())
      expect(result?.previousAdminRepliedAt).toBeNull()
      const row = await read(id)
      expect(row?.awaitingHumanReplySince).toBeNull()
      expect(row?.awaitingHumanReplyClosedAt?.getTime()).toBe(at(300).getTime())
      expect(row?.adminRepliedAt?.getTime()).toBe(at(300).getTime())
    })

    test("reports the previous adminRepliedAt and the assignment", async () => {
      const id = await newConversation({
        awaitingHumanReplySince: T0,
        adminRepliedAt: at(-3600),
        assignedUserId: userId,
        assignedUserAt: at(60),
      })

      const result = await closeHumanReplyWindow(
        { workspaceId, conversationId: id, repliedAt: at(300) },
        dbA,
      )

      expect(result?.previousAdminRepliedAt?.getTime()).toBe(
        at(-3600).getTime(),
      )
      expect(result?.assignedUserId).toBe(userId)
      expect(result?.assignedUserAt?.getTime()).toBe(at(60).getTime())
    })

    test("a window opened after the reply (since > repliedAt) is left open and not reported", async () => {
      const id = await newConversation({ awaitingHumanReplySince: at(600) })

      const result = await closeHumanReplyWindow(
        { workspaceId, conversationId: id, repliedAt: at(300) },
        dbA,
      )

      expect(result?.closedAwaitingSince).toBeNull()
      const row = await read(id)
      expect(row?.awaitingHumanReplySince?.getTime()).toBe(at(600).getTime())
      expect(row?.awaitingHumanReplyClosedAt?.getTime()).toBe(at(300).getTime())
    })

    test("the closed-at marker never moves backwards", async () => {
      const id = await newConversation({ awaitingHumanReplyClosedAt: at(900) })

      await closeHumanReplyWindow(
        { workspaceId, conversationId: id, repliedAt: at(300) },
        dbA,
      )

      expect((await read(id))?.awaitingHumanReplyClosedAt?.getTime()).toBe(
        at(900).getTime(),
      )
    })

    test("two concurrent replies on two connections: exactly one claims the window", async () => {
      const id = await newConversation({ awaitingHumanReplySince: T0 })
      await clientA.query("BEGIN")
      try {
        // Connection A claims the window inside an open transaction ...
        const resultA = await closeHumanReplyWindow(
          { workspaceId, conversationId: id, repliedAt: at(300) },
          dbA,
        )
        // ... while connection B starts the same claim and must wait on the row lock.
        const pendingB = closeHumanReplyWindow(
          { workspaceId, conversationId: id, repliedAt: at(301) },
          dbB,
        )
        await new Promise((resolve) => setTimeout(resolve, 200))
        await clientA.query("COMMIT")
        const resultB = await pendingB

        expect(resultA?.closedAwaitingSince?.getTime()).toBe(T0.getTime())
        expect(resultB?.closedAwaitingSince).toBeNull()
        expect((await read(id))?.awaitingHumanReplyClosedAt?.getTime()).toBe(
          at(301).getTime(),
        )
      } finally {
        await clientA.query("ROLLBACK").catch(() => undefined)
      }
    })

    test("another workspace cannot close the window", async () => {
      const id = await newConversation({ awaitingHumanReplySince: T0 })

      const result = await closeHumanReplyWindow(
        {
          workspaceId: otherWorkspaceId,
          conversationId: id,
          repliedAt: at(300),
        },
        dbA,
      )

      expect(result).toBeNull()
      expect((await read(id))?.awaitingHumanReplySince?.getTime()).toBe(
        T0.getTime(),
      )
    })

    test("assignUserIfUnassigned stamps assignedUserAt", async () => {
      const id = await newConversation()

      const [claimed] = await assignUserIfUnassigned(
        { workspaceId, conversationId: id, userId, assignedAt: at(10) },
        dbA,
      )

      expect(claimed?.assignedUserAt?.getTime()).toBe(at(10).getTime())
    })

    test("assignTargetIfUnassigned stamps assignedUserAt only when a user is set", async () => {
      const teamOnly = await newConversation()
      const withUser = await newConversation()
      const [team] = await dbA
        .insert(schema.inboxTeamModel)
        .values({ workspaceId, name: "chrw-team" })
        .returning({ id: schema.inboxTeamModel.id })

      await assignTargetIfUnassigned(
        {
          workspaceId,
          conversationId: teamOnly,
          assignedInboxTeamId: team.id,
          assignedAt: at(10),
        },
        dbA,
      )
      await assignTargetIfUnassigned(
        {
          workspaceId,
          conversationId: withUser,
          assignedUserId: userId,
          assignedAt: at(20),
        },
        dbA,
      )

      expect((await read(teamOnly))?.assignedUserAt).toBeNull()
      expect((await read(withUser))?.assignedUserAt?.getTime()).toBe(
        at(20).getTime(),
      )
    })

    describe("response SLA snapshot", () => {
      const snapshot = {
        responseDueAt: at(3600),
        responseSlaBreachingAt: at(2700),
        responseSlaTargetSeconds: 3600,
      }
      const read = async (id: string) =>
        (
          await dbA
            .select()
            .from(schema.conversationModel)
            .where(eq(schema.conversationModel.id, id))
        )[0]

      // The snapshot write only lands while the workspace's policy is on (the
      // workspace delete in afterAll cascades the policy away).
      beforeAll(async () => {
        await dbA.insert(schema.responseSlaPolicyModel).values({
          workspaceId,
          enabled: true,
          firstResponseTargetSeconds: 3600,
          nextResponseTargetSeconds: null,
          breachingThresholdPercent: 25,
        })
      })

      test("no snapshot is written while the policy is switched off", async () => {
        const id = await newConversation({ awaitingHumanReplySince: at(0) })
        const write = () =>
          responseSlaRepository.setSnapshotIfWindowUnchanged(
            { workspaceId, id, expectedSince: at(0), snapshot },
            dbA,
          )
        const setEnabled = (enabled: boolean) =>
          dbA
            .update(schema.responseSlaPolicyModel)
            .set({ enabled })
            .where(eq(schema.responseSlaPolicyModel.workspaceId, workspaceId))

        await setEnabled(false)
        expect(await write()).toBe(false)
        expect((await read(id)).responseDueAt).toBeNull()

        await setEnabled(true)
        expect(await write()).toBe(true)
      })

      test("closing the window clears all three snapshot fields and returns the closed due/target", async () => {
        const id = await newConversation({
          awaitingHumanReplySince: at(0),
          ...snapshot,
        })

        const claim = await closeHumanReplyWindow(
          { workspaceId, conversationId: id, repliedAt: at(600) },
          dbA,
        )

        expect(claim?.closedResponseDueAt).toEqual(snapshot.responseDueAt)
        expect(claim?.closedResponseSlaTargetSeconds).toBe(3600)
        const row = await read(id)
        expect(row.responseDueAt).toBeNull()
        expect(row.responseSlaBreachingAt).toBeNull()
        expect(row.responseSlaTargetSeconds).toBeNull()
      })

      test("a window opened after the reply keeps its snapshot and reports nothing closed", async () => {
        const id = await newConversation({
          awaitingHumanReplySince: at(900),
          ...snapshot,
        })

        const claim = await closeHumanReplyWindow(
          { workspaceId, conversationId: id, repliedAt: at(600) },
          dbA,
        )

        expect(claim?.closedResponseDueAt).toBeNull()
        const row = await read(id)
        expect(row.responseDueAt).toEqual(snapshot.responseDueAt)
        expect(row.responseSlaTargetSeconds).toBe(3600)
      })

      test("the snapshot is written only while the window is the one it was computed for", async () => {
        const id = await newConversation({ awaitingHumanReplySince: at(0) })
        const write = (expectedSince: Date) =>
          responseSlaRepository.setSnapshotIfWindowUnchanged(
            { workspaceId, id, expectedSince, snapshot },
            dbA,
          )

        expect(await write(at(5))).toBe(false)
        expect(await write(at(0))).toBe(true)
        expect((await read(id)).responseDueAt).toEqual(snapshot.responseDueAt)

        // A close that raced in leaves no stale deadline: the guard fails.
        await closeHumanReplyWindow(
          { workspaceId, conversationId: id, repliedAt: at(60) },
          dbA,
        )
        expect(await write(at(0))).toBe(false)
        expect((await read(id)).responseDueAt).toBeNull()
      })

      test("a concurrent reply waits for the lock-holding SLA write, then closes and reports the snapshot it set", async () => {
        const id = await newConversation({ awaitingHumanReplySince: at(0) })
        let closeSettled = false
        let closing: Promise<unknown> | undefined

        await dbA.transaction(async (tx) => {
          // Lock BEFORE the opening statement, exactly like trackWindow.
          await responseSlaRepository.readWindowStates(
            { workspaceId, ids: [id], lock: true },
            tx,
          )
          closing = closeHumanReplyWindow(
            { workspaceId, conversationId: id, repliedAt: at(600) },
            dbB,
          ).then((result) => {
            closeSettled = true
            return result
          })
          // Give the second connection time to run into the held lock.
          await new Promise((resolve) => setTimeout(resolve, 300))
          expect(closeSettled).toBe(false)

          expect(
            await responseSlaRepository.setSnapshotIfWindowUnchanged(
              { workspaceId, id, expectedSince: at(0), snapshot },
              tx,
            ),
          ).toBe(true)
        })

        const claim = (await closing) as Awaited<
          ReturnType<typeof closeHumanReplyWindow>
        >
        // The close ran after the SLA write committed, so it saw and cleared it.
        expect(claim?.closedResponseDueAt).toEqual(snapshot.responseDueAt)
        const row = await read(id)
        expect(row.responseDueAt).toBeNull()
        expect(row.responseSlaTargetSeconds).toBeNull()
      })

      test("clearWorkspaceSnapshots drops every snapshot of the workspace only", async () => {
        const mine = await newConversation({
          awaitingHumanReplySince: at(0),
          ...snapshot,
        })

        await responseSlaRepository.clearWorkspaceSnapshots(
          { workspaceId },
          dbA,
        )

        const row = await read(mine)
        expect(row.responseDueAt).toBeNull()
        expect(row.responseSlaBreachingAt).toBeNull()
        expect(row.responseSlaTargetSeconds).toBeNull()
        // The window itself is untouched: only the SLA snapshot goes.
        expect(row.awaitingHumanReplySince).toEqual(at(0))
      })

      test("a comment thread never receives a snapshot", async () => {
        const id = await newConversation({
          awaitingHumanReplySince: at(0),
          sourceId: "post-1",
        })

        expect(
          await responseSlaRepository.setSnapshotIfWindowUnchanged(
            { workspaceId, id, expectedSince: at(0), snapshot },
            dbA,
          ),
        ).toBe(false)
      })

      test("window states are read in id order and scoped to the workspace", async () => {
        const first = await newConversation()
        const second = await newConversation()

        const states = await dbA.transaction((tx) =>
          responseSlaRepository.readWindowStates(
            { workspaceId, ids: [second, first], lock: true },
            tx,
          ),
        )
        const foreign = await responseSlaRepository.readWindowStates(
          { workspaceId: otherWorkspaceId, ids: [first], lock: false },
          dbA,
        )

        expect(states.map((state) => state.id)).toEqual([first, second].sort())
        expect(foreign).toEqual([])
      })

      test("policy upsert keeps one row per workspace and validates through the CHECKs", async () => {
        await responseSlaRepository.upsertPolicy(
          {
            workspaceId,
            data: {
              enabled: true,
              firstResponseTargetSeconds: 300,
              nextResponseTargetSeconds: null,
              breachingThresholdPercent: 25,
            },
          },
          dbA,
        )
        const updated = await responseSlaRepository.upsertPolicy(
          {
            workspaceId,
            data: {
              enabled: false,
              firstResponseTargetSeconds: 600,
              nextResponseTargetSeconds: 900,
              breachingThresholdPercent: 10,
            },
          },
          dbA,
        )

        expect(updated.firstResponseTargetSeconds).toBe(600)
        expect(updated.enabled).toBe(false)
        expect(
          await dbA.$count(
            schema.responseSlaPolicyModel,
            eq(schema.responseSlaPolicyModel.workspaceId, workspaceId),
          ),
        ).toBe(1)
        await expect(
          responseSlaRepository.upsertPolicy(
            {
              workspaceId,
              data: {
                enabled: true,
                firstResponseTargetSeconds: 0,
                nextResponseTargetSeconds: null,
                breachingThresholdPercent: 25,
              },
            },
            dbA,
          ),
        ).rejects.toThrow()
        expect(
          await responseSlaRepository.deletePolicy({ workspaceId }, dbA),
        ).toBe(true)
      })
    })
  },
)
