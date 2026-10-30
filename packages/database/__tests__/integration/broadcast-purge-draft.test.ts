// @vitest-environment node

/**
 * `purgeBroadcastRecipients` against a real Postgres: every chunk runs in its
 * own transaction under `SET LOCAL statement_timeout`, and `onlyWhileDraft`
 * deletes only while the broadcast is still a draft — the background cleanup
 * of a draft's leftovers must never touch a re-scheduled broadcast's audience.
 * The fixture is committed and removed again in `afterAll` (workspace
 * deletion cascades to every row created here).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)(
  "purgeBroadcastRecipients against Postgres",
  async () => {
    // The repository talks to the shared `db`, so the real client is loaded
    // only when a database is reachable.
    const { db } = await import("../../src/client")
    const { hasBroadcastRecipients, purgeBroadcastRecipients } = await import(
      "../../src/repositories/broadcast-purge"
    )
    const schema = await import("../../src/schema")

    let workspaceId: string
    let ownerId: string
    let inboxId: string

    const newBroadcastWithRecipients = async (
      status: "draft" | "scheduled",
      recipients: number,
    ): Promise<string> => {
      const [broadcast] = await db
        .insert(schema.broadcastModel)
        .values({
          name: "purge-draft",
          workspaceId,
          status,
          schedulesType: "now",
          schedulesAt: new Date(),
          subaction: "webchatMessage",
          channel: "webchat",
        })
        .returning({ id: schema.broadcastModel.id })

      for (let index = 0; index < recipients; index++) {
        const [contact] = await db
          .insert(schema.contactModel)
          .values({ workspaceId })
          .returning({ id: schema.contactModel.id })
        const [contactInbox] = await db
          .insert(schema.contactInboxModel)
          .values({
            originalContactId: contact.id,
            contactId: contact.id,
            inboxId,
            channel: "webchat",
            source: "webchat",
            sourceId: `purge-draft-${broadcast.id}-${index}`,
          })
          .returning({ id: schema.contactInboxModel.id })
        const [conversation] = await db
          .insert(schema.conversationModel)
          .values({ workspaceId, contactId: contact.id })
          .returning({ id: schema.conversationModel.id })
        await db.insert(schema.contactsOnBroadcastsModel).values({
          broadcastId: broadcast.id,
          contactId: contact.id,
          contactInboxId: contactInbox.id,
          conversationId: conversation.id,
        })
      }
      return broadcast.id
    }

    beforeAll(async () => {
      const stamp = `${Date.now()}-${Math.random()}`
      const [owner] = await db
        .insert(schema.userModel)
        .values({ email: `purge-draft-owner-${stamp}@example.test` })
        .returning({ id: schema.userModel.id })
      ownerId = owner.id
      const [workspace] = await db
        .insert(schema.workspaceModel)
        .values({ name: "purge-draft", ownerId })
        .returning({ id: schema.workspaceModel.id })
      workspaceId = workspace.id
      const [inbox] = await db
        .insert(schema.inboxModel)
        .values({
          name: "purge-draft",
          channel: "webchat",
          sourceId: `purge-draft-${stamp}`,
          workspaceId,
        })
        .returning({ id: schema.inboxModel.id })
      inboxId = inbox.id
    })

    afterAll(async () => {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
      await db.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
    })

    test("drains a draft's recipients chunk by chunk", async () => {
      const broadcastId = await newBroadcastWithRecipients("draft", 3)

      const result = await purgeBroadcastRecipients({
        broadcastId,
        chunkSize: 2,
        interChunkDelayMs: 0,
        maxRunDurationMs: 30_000,
        onlyWhileDraft: true,
      })

      expect(result).toEqual({ deleted: 3, stopReason: "drained" })
      expect(await hasBroadcastRecipients(broadcastId)).toBe(false)
    })

    test("leaves a broadcast that is no longer a draft untouched", async () => {
      const broadcastId = await newBroadcastWithRecipients("scheduled", 2)

      const result = await purgeBroadcastRecipients({
        broadcastId,
        chunkSize: 2,
        interChunkDelayMs: 0,
        maxRunDurationMs: 30_000,
        onlyWhileDraft: true,
      })

      expect(result).toEqual({ deleted: 0, stopReason: "drained" })
      expect(await hasBroadcastRecipients(broadcastId)).toBe(true)
    })
  },
)
