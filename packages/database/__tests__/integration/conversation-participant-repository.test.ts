// @vitest-environment node

/**
 * `conversationParticipantRepository` against a real database: the reply
 * upsert is monotonic and race-safe, and the keyset list is ordered, bounded
 * and free of secret user columns. The fixture is committed and removed in
 * `afterAll` (workspace deletion cascades).
 *
 * Needs the `lastRepliedAt` migration applied. Skipped only when
 * `DATABASE_URL` is unset; run with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { conversationParticipantRepository } from "../../src/repositories/conversation-participant/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)("conversationParticipantRepository", () => {
  let clientA: Client
  let clientB: Client
  let dbA: ReturnType<typeof createDatabase>
  let dbB: ReturnType<typeof createDatabase>
  let workspaceId: string
  let conversationId: string
  let ownerId: string
  let memberIds: string[]

  const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 10, minute))

  beforeAll(async () => {
    clientA = new Client({ connectionString: databaseUrl as string })
    clientB = new Client({ connectionString: databaseUrl as string })
    await Promise.all([clientA.connect(), clientB.connect()])
    dbA = createDatabase(clientA)
    dbB = createDatabase(clientB)
    const stamp = `${Date.now()}-${Math.random()}`
    const members = await dbA
      .insert(schema.userModel)
      .values(
        ["owner", "a", "b", "c"].map((name) => ({
          email: `participant-${name}-${stamp}@example.test`,
          name,
        })),
      )
      .returning({ id: schema.userModel.id })
    ownerId = members[0].id
    memberIds = members.slice(1).map((member) => member.id)
    const [workspace] = await dbA
      .insert(schema.workspaceModel)
      .values({ name: "participant-repo", ownerId })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    const [contact] = await dbA
      .insert(schema.contactModel)
      .values({ workspaceId })
      .returning({ id: schema.contactModel.id })
    const [conversation] = await dbA
      .insert(schema.conversationModel)
      .values({ workspaceId, contactId: contact.id })
      .returning({ id: schema.conversationModel.id })
    conversationId = conversation.id
  })

  afterAll(async () => {
    await dbA
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, workspaceId))
    await dbA.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
    for (const id of memberIds) {
      await dbA.delete(schema.userModel).where(eq(schema.userModel.id, id))
    }
    await Promise.all([clientA.end(), clientB.end()])
  })

  const record = (userId: string, time: Date, database = dbA) =>
    conversationParticipantRepository.upsertReply(
      { workspaceId, conversationId, userId, at: time },
      database,
    )

  const list = (limit = 10, cursor?: { lastRepliedAt: Date; userId: string }) =>
    conversationParticipantRepository.listRepliedByConversation(
      { workspaceId, conversationId, limit, cursor },
      dbA,
    )

  test("inserts, advances on a newer time, and ignores equal or older times", async () => {
    const [a] = memberIds
    expect(await record(a, at(5))).toBe(true)
    expect(await record(a, at(5))).toBe(false)
    expect(await record(a, at(1))).toBe(false)
    expect(await record(a, at(9))).toBe(true)
    const rows = await list()
    expect(rows.filter((row) => row.userId === a)).toEqual([
      expect.objectContaining({ lastRepliedAt: at(9) }),
    ])
  })

  test("concurrent upserts from two connections end with the latest time", async () => {
    const [, b] = memberIds
    await Promise.all(
      [1, 2, 3, 4, 5, 6].map((minute) =>
        record(b, at(minute * 3), minute % 2 ? dbA : dbB),
      ),
    )
    const rows = await list()
    expect(rows.find((row) => row.userId === b)?.lastRepliedAt).toEqual(at(18))
  })

  test("lists newest first without secret user columns and pages by cursor", async () => {
    const [a, b, c] = memberIds
    await record(c, at(18)) // ties with b: userId breaks the tie
    const all = await list()
    const expected = [a, b, c]
      .map((userId) => ({
        userId,
        time: all.find((row) => row.userId === userId)?.lastRepliedAt as Date,
      }))
      .sort(
        (x, y) =>
          y.time.getTime() - x.time.getTime() || (y.userId > x.userId ? 1 : -1),
      )
      .map((row) => row.userId)
    expect(all.map((row) => row.userId)).toEqual(expected)
    expect(Object.keys(all[0].user).sort()).toEqual(["id", "image", "name"])

    const first = await list(1)
    const second = await list(1, {
      lastRepliedAt: first[0].lastRepliedAt,
      userId: first[0].userId,
    })
    const third = await list(1, {
      lastRepliedAt: second[0].lastRepliedAt,
      userId: second[0].userId,
    })
    expect([first[0], second[0], third[0]].map((row) => row.userId)).toEqual(
      expected,
    )
  })

  test("rows with a null lastRepliedAt are never listed", async () => {
    await dbA.insert(schema.conversationParticipantModel).values({
      workspaceId,
      conversationId,
      userId: ownerId,
    })
    const rows = await list()
    expect(rows.map((row) => row.userId)).not.toContain(ownerId)
    expect(await record(ownerId, at(30))).toBe(true)
    expect((await list())[0].userId).toBe(ownerId)
  })

  test("deleting a user account removes their participant rows", async () => {
    const [a] = memberIds
    await dbA.delete(schema.userModel).where(eq(schema.userModel.id, a))
    const rows = await list()
    expect(rows.map((row) => row.userId)).not.toContain(a)
  })
})
