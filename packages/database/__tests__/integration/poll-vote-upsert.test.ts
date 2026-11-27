// @vitest-environment node

/**
 * `pollRepository.upsertVote` race safety: two concurrent first votes by the
 * same contact for the same candidate must resolve to exactly one `new` and one
 * `unchanged` (the unique `(pollId, contactId)` index arbitrates). Needs two
 * committed connections, so the fixture is committed and deleted in `afterAll`
 * (workspace deletion cascades).
 *
 * NOTE: unlike the other test:db files, this one WRITES rows (a User, Workspace,
 * Poll and Contacts) and deletes them itself. Identifiers are unique per run
 * (random suffix) and cleanup runs even when setup or an assertion fails
 * (`cleanup` is idempotent and also invoked from a failed `beforeAll`).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { pollRepository } from "../../src/repositories/poll/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const ROUNDS = 10

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)("pollRepository.upsertVote concurrency", () => {
  let clientA: Client
  let clientB: Client
  let dbA: ReturnType<typeof createDatabase>
  let dbB: ReturnType<typeof createDatabase>
  let ownerId: string
  let workspaceId: string
  let pollId: string
  let candidateId: string
  let contactIds: string[]

  const cleanup = async () => {
    try {
      if (workspaceId) {
        await dbA
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, workspaceId))
      }
      if (ownerId) {
        await dbA
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, ownerId))
      }
    } finally {
      await Promise.all([clientA?.end(), clientB?.end()])
    }
  }

  beforeAll(async () => {
    clientA = new Client({ connectionString: databaseUrl as string })
    clientB = new Client({ connectionString: databaseUrl as string })
    await Promise.all([clientA.connect(), clientB.connect()])
    dbA = createDatabase(clientA)
    dbB = createDatabase(clientB)

    try {
      const [owner] = await dbA
        .insert(schema.userModel)
        .values({
          email: `poll-vote-${Date.now()}-${Math.random()}@example.test`,
        })
        .returning({ id: schema.userModel.id })
      ownerId = owner.id
      const [workspace] = await dbA
        .insert(schema.workspaceModel)
        .values({ name: "poll-vote", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id

      const poll = await pollRepository.insertWithCandidates(
        {
          workspaceId,
          name: "poll-vote",
          imageUrl: "https://example.test/p.png",
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 3_600_000),
          candidates: [{ name: "a" }, { name: "b" }],
        },
        dbA,
      )
      pollId = poll.id
      candidateId = poll.candidates[0].id

      const contacts = await dbA
        .insert(schema.contactModel)
        .values(Array.from({ length: ROUNDS }, () => ({ workspaceId })))
        .returning({ id: schema.contactModel.id })
      contactIds = contacts.map((contact) => contact.id)
    } catch (error) {
      await cleanup()
      throw error
    }
  })

  afterAll(cleanup)

  test("two parallel votes for the same candidate yield one new and one unchanged", async () => {
    for (const contactId of contactIds) {
      const input = { workspaceId, pollId, candidateId, contactId }
      const results = await Promise.all([
        pollRepository.upsertVote(input, dbA),
        pollRepository.upsertVote(input, dbB),
      ])
      expect(results.map((r) => r.result).sort()).toEqual(["new", "unchanged"])
    }
  })

  test("an unchanged re-vote reports when the current vote was cast", async () => {
    const contactId = contactIds[0] as string
    const input = { workspaceId, pollId, candidateId, contactId }
    const first = await pollRepository.upsertVote(input, dbA)
    const again = await pollRepository.upsertVote(input, dbA)
    expect(again.result).toBe("unchanged")
    expect(first.votedAt).toBeInstanceOf(Date)
    expect(again.votedAt?.getTime()).toBe(first.votedAt?.getTime())
  })
})
