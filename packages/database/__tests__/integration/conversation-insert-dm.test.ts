// @vitest-environment node

/**
 * `insertDmConversationsIfAbsent` against a real Postgres: the DM is the one
 * conversation per contact with `sourceId IS NULL` (partial unique index
 * `Conversation_contactId_dm_key`), so conflicts must be swallowed, not thrown.
 * The concurrency case needs two committed connections, so the fixture is
 * committed and deleted again in `afterAll` (workspace deletion cascades to
 * contact and conversation).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { insertDmConversationsIfAbsent } from "../../src/repositories/conversation/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)(
  "conversationRepository.insertDmConversationsIfAbsent against Postgres",
  () => {
    let clientA: Client
    let clientB: Client
    let dbA: ReturnType<typeof createDatabase>
    let dbB: ReturnType<typeof createDatabase>
    let workspaceId: string
    let ownerId: string

    const newContact = async (): Promise<string> => {
      const [contact] = await dbA
        .insert(schema.contactModel)
        .values({ workspaceId })
        .returning({ id: schema.contactModel.id })
      return contact.id
    }

    const conversationsOf = async (contactId: string) =>
      await dbA.query.conversationModel.findMany({
        where: { workspaceId, contactId },
        columns: { id: true, sourceId: true },
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
        .values({ email: `idm-owner-${stamp}@example.test` })
        .returning({ id: schema.userModel.id })
      ownerId = owner.id
      const [workspace] = await dbA
        .insert(schema.workspaceModel)
        .values({ name: "idm-a", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
    })

    afterAll(async () => {
      await dbA
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await dbA.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
      await Promise.all([clientA.end(), clientB.end()])
    })

    test("opens one DM (sourceId null) for each contact that has none", async () => {
      const contactIds = [await newContact(), await newContact()]

      await insertDmConversationsIfAbsent({ workspaceId, contactIds }, dbA)

      for (const contactId of contactIds) {
        const rows = await conversationsOf(contactId)
        expect(rows).toHaveLength(1)
        expect(rows[0]?.sourceId).toBeNull()
      }
    })

    test("opens a DM next to a comment thread without touching the thread", async () => {
      const contactId = await newContact()
      await dbA
        .insert(schema.conversationModel)
        .values({ workspaceId, contactId, sourceId: "post-1" })

      await insertDmConversationsIfAbsent(
        { workspaceId, contactIds: [contactId] },
        dbA,
      )

      const rows = await conversationsOf(contactId)
      expect(rows.map((row) => row.sourceId).sort()).toEqual([null, "post-1"])
    })

    test("is idempotent: an existing DM is kept and no error is raised", async () => {
      const contactId = await newContact()
      await insertDmConversationsIfAbsent(
        { workspaceId, contactIds: [contactId] },
        dbA,
      )
      const [first] = await conversationsOf(contactId)

      await insertDmConversationsIfAbsent(
        { workspaceId, contactIds: [contactId] },
        dbA,
      )

      const rows = await conversationsOf(contactId)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe(first?.id)
    })

    test("two connections opening the same DMs at once leave exactly one DM each", async () => {
      const contactIds = [await newContact(), await newContact()]

      await Promise.all([
        insertDmConversationsIfAbsent({ workspaceId, contactIds }, dbA),
        insertDmConversationsIfAbsent({ workspaceId, contactIds }, dbB),
      ])

      for (const contactId of contactIds) {
        expect(await conversationsOf(contactId)).toHaveLength(1)
      }
    })
  },
)
