// @vitest-environment node

/**
 * R1 of the posts test plan: a raw `DELETE FROM "Inbox"` of an inbox whose
 * publish binding has a post target is REJECTED by the foreign key (the cascade
 * to `PublishDestination` is blocked by `SocialPostTarget.publishDestinationId`
 * RESTRICT), so a hard delete can never orphan or silently drop post history.
 * The app's disconnect path only flips `Inbox.status`; the binding, its targets
 * and the post survive and the binding reads as `inboxDisconnected`.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  publishDestinationRepository,
  publishDestinationStateRepository,
} from "../../src/repositories/publish-destination"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const FOREIGN_KEY_VIOLATION = /foreign key|violates/i

describe.skipIf(!databaseUrl)(
  "inbox deletion with post history against a real database",
  () => {
    let client: Client
    let userId: string
    let workspaceId: string
    let sequence = 0
    const nextId = (): string =>
      `${Date.now()}${String(++sequence).padStart(6, "0")}`
    const database = () => drizzle({ client, relations, schema })

    interface Fixture {
      destinationId: string
      inboxId: string
      postId: string
      targetId: string
    }

    const countRows = async (table: string, id: string): Promise<number> => {
      const result = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM "${table}" WHERE id = $1`,
        [id],
      )
      return Number(result.rows[0].n)
    }

    const fixtureWithTarget = async (): Promise<Fixture> => {
      const db = database()
      const [inbox] = await db
        .insert(schema.inboxModel)
        .values({
          channel: "messenger",
          name: `guard-${nextId()}`,
          sourceId: nextId(),
          status: "connected",
          workspaceId,
        })
        .returning({ id: schema.inboxModel.id })
      const [binding] = await publishDestinationRepository.ensureForInboxes(
        { inboxIds: [inbox.id], workspaceId },
        db as never,
      )
      const postId = nextId()
      await socialPostRepository.insertPost(
        {
          createdById: null,
          createdVia: "api",
          id: postId,
          idempotencyKey: null,
          idempotencyRequestHash: null,
          linkUrl: null,
          text: "history",
          workspaceId,
        },
        db as never,
      )
      const targetId = nextId()
      await client.query(
        `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType")
         VALUES ($1,$2,$3,$4,'facebook','text')`,
        [targetId, postId, workspaceId, binding.id],
      )
      return {
        destinationId: binding.id,
        inboxId: inbox.id,
        postId,
        targetId,
      }
    }

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      const suffix = `${Date.now()}-${Math.random()}`
      const [user] = await database()
        .insert(schema.userModel)
        .values({ email: `inbox-guard-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      const [workspace] = await database()
        .insert(schema.workspaceModel)
        .values({ name: `inbox-guard-${suffix}`, ownerId: user.id })
        .returning({ id: schema.workspaceModel.id })
      userId = user.id
      workspaceId = workspace.id
    })

    afterAll(async () => {
      // Targets first: they RESTRICT the bindings that the workspace cascade drains.
      await client.query(
        `DELETE FROM "SocialPostTarget" WHERE "workspaceId" = $1`,
        [workspaceId],
      )
      await client.query(`DELETE FROM "Workspace" WHERE "ownerId" = $1`, [
        userId,
      ])
      await client.query(`DELETE FROM "User" WHERE id = $1`, [userId])
      await client.end()
    })

    test("a raw Inbox DELETE is rejected while a post target points at its binding, and nothing is orphaned", async () => {
      const fixture = await fixtureWithTarget()

      await expect(
        client.query(`DELETE FROM "Inbox" WHERE id = $1`, [fixture.inboxId]),
      ).rejects.toThrow(FOREIGN_KEY_VIOLATION)

      expect(await countRows("Inbox", fixture.inboxId)).toBe(1)
      expect(await countRows("PublishDestination", fixture.destinationId)).toBe(
        1,
      )
      expect(await countRows("SocialPostTarget", fixture.targetId)).toBe(1)
      expect(await countRows("SocialPost", fixture.postId)).toBe(1)
    })

    test("the rejected delete leaves the connection usable (the failed statement does not poison later writes)", async () => {
      const fixture = await fixtureWithTarget()
      await expect(
        client.query(`DELETE FROM "Inbox" WHERE id = $1`, [fixture.inboxId]),
      ).rejects.toThrow()
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok")
      expect(result.rows[0].ok).toBe(1)
    })

    test("disconnecting through the app (status flip) keeps the binding and targets and marks it inboxDisconnected", async () => {
      const fixture = await fixtureWithTarget()
      await client.query(
        `UPDATE "Inbox" SET "status" = 'disconnected', "disconnectedAt" = now() WHERE id = $1`,
        [fixture.inboxId],
      )

      expect(await countRows("PublishDestination", fixture.destinationId)).toBe(
        1,
      )
      expect(await countRows("SocialPostTarget", fixture.targetId)).toBe(1)
      const [row] = await publishDestinationStateRepository.list(
        { ids: [fixture.destinationId], workspaceId },
        database() as never,
      )
      expect(row.state).toBe("inboxDisconnected")

      // Reconnecting the same Page restores the same binding id (bindings survive).
      await client.query(
        `UPDATE "Inbox" SET "status" = 'connected', "disconnectedAt" = NULL WHERE id = $1`,
        [fixture.inboxId],
      )
      const [again] = await publishDestinationRepository.ensureForInboxes(
        { inboxIds: [fixture.inboxId], workspaceId },
        database() as never,
      )
      expect(again.id).toBe(fixture.destinationId)
    })

    test("an inbox without any target still cascades to its binding (the guard is only the target RESTRICT)", async () => {
      const db = database()
      const [inbox] = await db
        .insert(schema.inboxModel)
        .values({
          channel: "messenger",
          name: `guard-empty-${nextId()}`,
          sourceId: nextId(),
          workspaceId,
        })
        .returning({ id: schema.inboxModel.id })
      const [binding] = await publishDestinationRepository.ensureForInboxes(
        { inboxIds: [inbox.id], workspaceId },
        db as never,
      )
      await client.query(`DELETE FROM "Inbox" WHERE id = $1`, [inbox.id])
      expect(await countRows("PublishDestination", binding.id)).toBe(0)
    })
  },
)
