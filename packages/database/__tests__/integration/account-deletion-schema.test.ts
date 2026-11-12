// @vitest-environment node

/**
 * Requires the account_deletion migration. Run with
 * `pnpm --filter @chatbotx.io/database test:db` against a migrated database.
 * The fixture transaction always rolls back.
 */
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const withRolledBackTransaction = async (
  db: DatabaseClient,
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

describe.skipIf(!databaseUrl)(
  "account deletion schema against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    test("preserves notes and includes every bounded user-reference index", async () => {
      await withRolledBackTransaction(createDatabase(client), async (tx) => {
        const suffix = `${Date.now()}-${Math.random()}`
        const [owner] = await tx
          .insert(schema.userModel)
          .values({ email: `account-deletion-owner-${suffix}@example.test` })
          .returning({ id: schema.userModel.id })
        const [deletingUser] = await tx
          .insert(schema.userModel)
          .values({ email: `account-deletion-user-${suffix}@example.test` })
          .returning({ id: schema.userModel.id })
        const [workspace] = await tx
          .insert(schema.workspaceModel)
          .values({ name: "account-deletion", ownerId: owner.id })
          .returning({ id: schema.workspaceModel.id })
        const [contact] = await tx
          .insert(schema.contactModel)
          .values({ workspaceId: workspace.id })
          .returning({ id: schema.contactModel.id })
        const [note] = await tx
          .insert(schema.contactNoteModel)
          .values({
            contactId: contact.id,
            createdById: deletingUser.id,
            text: "Keep this note",
          })
          .returning({ id: schema.contactNoteModel.id })

        await tx
          .delete(schema.userModel)
          .where(eq(schema.userModel.id, deletingUser.id))

        const [preservedNote] = await tx
          .select({ createdById: schema.contactNoteModel.createdById })
          .from(schema.contactNoteModel)
          .where(eq(schema.contactNoteModel.id, note.id))
        expect(preservedNote?.createdById).toBeNull()

        const indexRows = await tx.execute<{
          indexdef: string
          indexname: string
        }>(sql`
        SELECT indexdef, indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'User_scheduledDeletionAt_idx',
            'Conversation_assignedUserId_idx',
            'AuditLog_userId_idx',
            'ContactNote_createdById_idx',
            'ConversationParticipant_userId_idx'
          )
      `)
        const indexes = new Map(
          indexRows.rows.map((row) => [row.indexname, row.indexdef]),
        )
        expect([...indexes.keys()].sort()).toEqual([
          "AuditLog_userId_idx",
          "ContactNote_createdById_idx",
          "ConversationParticipant_userId_idx",
          "Conversation_assignedUserId_idx",
          "User_scheduledDeletionAt_idx",
        ])
        for (const indexName of [
          "AuditLog_userId_idx",
          "ContactNote_createdById_idx",
          "Conversation_assignedUserId_idx",
          "User_scheduledDeletionAt_idx",
        ]) {
          expect(indexes.get(indexName)).toContain("WHERE")
        }
      })
    })
  },
)
