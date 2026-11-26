// @vitest-environment node

/**
 * The publish binding against a real database: the CHECKs and partial unique
 * keys, an idempotent and concurrency-safe `ensureForInboxes`, tenancy on every
 * read and write, the credential source of each network, the token fences, and
 * the RESTRICT / CASCADE of the tables that point at a binding.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { createHash } from "node:crypto"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  PublishDestinationWorkspaceError,
  publishCredentialRepository,
  publishDestinationRepository,
  publishDestinationStateRepository,
} from "../../src/repositories/publish-destination"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
import {
  HEAVY_WORKSPACE_TABLES,
  workspacePurgeRepository,
} from "../../src/repositories/workspace-purge"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"
import { insertPublishDestination } from "./publish-destination-fixture"

const databaseUrl = realDatabaseUrl()
const fingerprint = (token: string) =>
  createHash("sha256").update(token).digest("hex")

describe.skipIf(!databaseUrl)(
  "publish destinations against a real database",
  () => {
    let client: Client
    let userId: string
    let workspaceId: string
    let otherWorkspaceId: string
    let sequence = 0
    const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
    const database = () => drizzle({ client, relations, schema })

    const insertInbox = async (
      workspace: string,
      channel: "messenger" | "instagram" | "threads",
      status = "connected",
    ) => {
      const [inbox] = await database()
        .insert(schema.inboxModel)
        .values({
          channel,
          name: `${channel}-${nextId()}`,
          sourceId: nextId(),
          status,
          workspaceId: workspace,
        })
        .returning({ id: schema.inboxModel.id })
      return inbox.id
    }

    const insertMessenger = async (
      inboxId: string,
      workspace: string,
      token: string,
    ) => {
      const [row] = await database()
        .insert(schema.integrationMessengerModel)
        .values({
          auth: { tokens: { accessToken: token } },
          conversationStarters: [],
          persistentMenus: [],
          personas: [],
          inboxId,
          name: "page",
          pageId: `page-${nextId()}`,
          workspaceId: workspace,
        })
        .returning({
          id: schema.integrationMessengerModel.id,
          pageId: schema.integrationMessengerModel.pageId,
        })
      return row
    }

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      const db = database()
      const suffix = `${Date.now()}-${Math.random()}`
      const [user] = await db
        .insert(schema.userModel)
        .values({ email: `pd-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      const workspaces = await db
        .insert(schema.workspaceModel)
        .values([
          { name: `pd-${suffix}`, ownerId: user.id },
          { name: `pd-other-${suffix}`, ownerId: user.id },
        ])
        .returning({ id: schema.workspaceModel.id })
      userId = user.id
      workspaceId = workspaces[0].id
      otherWorkspaceId = workspaces[1].id
    })

    afterAll(async () => {
      await client.query(`DELETE FROM "Workspace" WHERE "ownerId" = $1`, [
        userId,
      ])
      await client.query(`DELETE FROM "User" WHERE id = $1`, [userId])
      await client.end()
    })

    describe("constraints", () => {
      test("exactly one binding target is required", async () => {
        await expect(
          client.query(
            `INSERT INTO "PublishDestination" ("id","workspaceId","provider") VALUES ($1,$2,'facebook')`,
            [nextId(), workspaceId],
          ),
        ).rejects.toThrow("PublishDestination_binding_check")
      })

      test("only TikTok binds a social account destination, and TikTok must", async () => {
        const inboxId = await insertInbox(workspaceId, "messenger")
        await expect(
          client.query(
            `INSERT INTO "PublishDestination" ("id","workspaceId","provider","inboxId") VALUES ($1,$2,'tiktok',$3)`,
            [nextId(), workspaceId, inboxId],
          ),
        ).rejects.toThrow("PublishDestination_tiktok_check")
      })

      test("an inbox has one binding", async () => {
        const inboxId = await insertInbox(workspaceId, "threads")
        await client.query(
          `INSERT INTO "PublishDestination" ("id","workspaceId","provider","inboxId") VALUES ($1,$2,'threads',$3)`,
          [nextId(), workspaceId, inboxId],
        )
        await expect(
          client.query(
            `INSERT INTO "PublishDestination" ("id","workspaceId","provider","inboxId") VALUES ($1,$2,'threads',$3)`,
            [nextId(), workspaceId, inboxId],
          ),
        ).rejects.toThrow("PublishDestination_inboxId_key")
      })

      test("a social account only holds TikTok", async () => {
        await expect(
          client.query(
            `INSERT INTO "SocialAccount" ("id","workspaceId","provider","externalAccountId","displayName") VALUES ($1,$2,'facebook','x','x')`,
            [nextId(), workspaceId],
          ),
        ).rejects.toThrow("SocialAccount_tiktok_check")
      })
    })

    describe("ensureForInboxes", () => {
      test("is idempotent and keeps the same ids", async () => {
        const inboxIds = [
          await insertInbox(workspaceId, "messenger"),
          await insertInbox(workspaceId, "instagram"),
          await insertInbox(workspaceId, "threads"),
        ]
        const db = database()
        const first = await publishDestinationRepository.ensureForInboxes(
          { inboxIds, workspaceId },
          db as never,
        )
        const second = await publishDestinationRepository.ensureForInboxes(
          { inboxIds, workspaceId },
          db as never,
        )
        expect(first).toHaveLength(3)
        expect(second.map((row) => row.id).sort()).toEqual(
          first.map((row) => row.id).sort(),
        )
        const providers = await client.query(
          `SELECT "provider" FROM "PublishDestination" WHERE "inboxId" = ANY($1::bigint[]) ORDER BY "provider"`,
          [inboxIds],
        )
        expect(providers.rows.map((row) => row.provider)).toEqual([
          "facebook",
          "instagram",
          "threads",
        ])
      })

      test("concurrent calls create one binding per inbox", async () => {
        const inboxId = await insertInbox(workspaceId, "messenger")
        await Promise.all(
          Array.from({ length: 8 }, () =>
            publishDestinationRepository.ensureForInboxes(
              { inboxIds: [inboxId], workspaceId },
              database() as never,
            ),
          ),
        )
        const rows = await client.query(
          `SELECT 1 FROM "PublishDestination" WHERE "inboxId" = $1`,
          [inboxId],
        )
        expect(rows.rowCount).toBe(1)
      })

      test("never binds an inbox of another workspace", async () => {
        const foreign = await insertInbox(otherWorkspaceId, "messenger")
        const rows = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: [foreign], workspaceId },
          database() as never,
        )
        expect(rows).toEqual([])
        const stored = await client.query(
          `SELECT 1 FROM "PublishDestination" WHERE "inboxId" = $1`,
          [foreign],
        )
        expect(stored.rowCount).toBe(0)
      })

      test("is bounded: at most the cap of inboxes per call", async () => {
        const ids = Array.from({ length: 5 }, () => nextId())
        const rows = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: ids, workspaceId },
          database() as never,
        )
        expect(rows).toEqual([])
      })
    })

    describe("tenancy", () => {
      test("assertInWorkspace rejects a destination of another workspace", async () => {
        const mine = await insertPublishDestination(database() as never, {
          label: "mine",
          workspaceId,
        })
        const theirs = await insertPublishDestination(database() as never, {
          label: "theirs",
          workspaceId: otherWorkspaceId,
        })
        await expect(
          publishDestinationRepository.assertInWorkspace(
            { ids: [mine, theirs], workspaceId },
            database() as never,
          ),
        ).rejects.toBeInstanceOf(PublishDestinationWorkspaceError)
        await expect(
          publishDestinationRepository.assertInWorkspace(
            { ids: [mine], workspaceId },
            database() as never,
          ),
        ).resolves.toBeUndefined()
      })

      test("a post target cannot point at another workspace's destination", async () => {
        const theirs = await insertPublishDestination(database() as never, {
          label: "theirs-target",
          workspaceId: otherWorkspaceId,
        })
        const created = await socialPostRepository.insertPost(
          {
            createdById: null,
            createdVia: "api",
            id: nextId(),
            idempotencyKey: null,
            idempotencyRequestHash: null,
            linkUrl: null,
            text: "x",
            workspaceId,
          },
          database() as never,
        )
        await expect(
          socialPostRepository.insertTargets(
            [
              {
                contentType: "text",
                id: nextId(),
                options: {},
                overridesMedia: false,
                provider: "facebook",
                publishDestinationId: theirs,
                scheduleMode: "custom",
                socialPostId: created?.id ?? "",
                textOverride: null,
                workspaceId,
              },
            ],
            database() as never,
          ),
        ).rejects.toBeInstanceOf(PublishDestinationWorkspaceError)
      })

      test("the credential source and state reads return nothing across workspaces", async () => {
        const theirs = await insertPublishDestination(database() as never, {
          label: "theirs-read",
          workspaceId: otherWorkspaceId,
        })
        expect(
          await publishCredentialRepository.findCredentialSource(
            { publishDestinationId: theirs, workspaceId },
            database() as never,
          ),
        ).toBeNull()
        expect(
          await publishDestinationStateRepository.findById(
            { id: theirs, workspaceId },
            database() as never,
          ),
        ).toBeNull()
      })
    })

    describe("credential source and fences", () => {
      test("loads the Page token source of a Facebook inbox", async () => {
        const inboxId = await insertInbox(workspaceId, "messenger")
        const messenger = await insertMessenger(inboxId, workspaceId, "tok-1")
        const [binding] = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        const source = await publishCredentialRepository.findCredentialSource(
          { publishDestinationId: binding.id, workspaceId },
          database() as never,
        )
        expect(source).toMatchObject({
          externalId: messenger.pageId,
          inboxStatus: "connected",
          integrationTable: "IntegrationMessenger",
          kind: "inbox",
          publisherKey: "facebook",
          tokenRefreshError: null,
        })
      })

      test("marks the token rejected only for the fingerprint it was read with", async () => {
        const inboxId = await insertInbox(workspaceId, "messenger")
        const messenger = await insertMessenger(inboxId, workspaceId, "tok-2")
        const args = {
          integrationId: messenger.id,
          provider: "facebook" as const,
          workspaceId,
        }
        expect(
          await publishCredentialRepository.markInboxTokenRejected(
            { ...args, tokenFingerprint: fingerprint("old-token") },
            database() as never,
          ),
        ).toBe(false)
        expect(
          await publishCredentialRepository.markInboxTokenRejected(
            {
              ...args,
              workspaceId: otherWorkspaceId,
              tokenFingerprint: fingerprint("tok-2"),
            },
            database() as never,
          ),
        ).toBe(false)
        expect(
          await publishCredentialRepository.markInboxTokenRejected(
            { ...args, tokenFingerprint: fingerprint("tok-2") },
            database() as never,
          ),
        ).toBe(true)
        // Already marked: a second failure writes nothing.
        expect(
          await publishCredentialRepository.markInboxTokenRejected(
            { ...args, tokenFingerprint: fingerprint("tok-2") },
            database() as never,
          ),
        ).toBe(false)
        const state = await publishDestinationStateRepository.list(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        expect(state).toEqual([])
      })

      test("permissionMissing is stored only while the token is the stored one", async () => {
        const inboxId = await insertInbox(workspaceId, "messenger")
        await insertMessenger(inboxId, workspaceId, "tok-3")
        const [binding] = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        const write = (token: string) =>
          publishDestinationRepository.recordPermissionMissing(
            {
              id: binding.id,
              missingScopes: ["pages_manage_posts"],
              now: new Date(),
              provider: "facebook",
              tokenFingerprint: fingerprint(token),
              workspaceId,
            },
            database() as never,
          )
        expect(await write("stale")).toBe(false)
        expect(await write("tok-3")).toBe(true)
        const [row] = await publishDestinationStateRepository.list(
          { ids: [binding.id], workspaceId },
          database() as never,
        )
        expect(row.state).toBe("permissionMissing")
        expect(row.missingScopes).toEqual(["pages_manage_posts"])
        await publishDestinationRepository.resetPublishStatus(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        const [reset] = await publishDestinationStateRepository.list(
          { ids: [binding.id], workspaceId },
          database() as never,
        )
        expect(reset.state).toBe("ready")
      })

      test("a disconnected inbox reads as inboxDisconnected and drops out of connected-only lists", async () => {
        const inboxId = await insertInbox(
          workspaceId,
          "messenger",
          "disconnected",
        )
        await insertMessenger(inboxId, workspaceId, "tok-4")
        const [binding] = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        const [row] = await publishDestinationStateRepository.list(
          { ids: [binding.id], workspaceId },
          database() as never,
        )
        expect(row.state).toBe("inboxDisconnected")
        expect(
          await publishDestinationStateRepository.list(
            { connectedOnly: true, ids: [binding.id], workspaceId },
            database() as never,
          ),
        ).toEqual([])
      })
    })

    describe("dependents", () => {
      test("a binding with targets cannot be deleted (RESTRICT)", async () => {
        const destinationId = await insertPublishDestination(
          database() as never,
          {
            label: "restrict",
            workspaceId,
          },
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
            text: "x",
            workspaceId,
          },
          database() as never,
        )
        const targetId = nextId()
        await client.query(
          `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType")
         VALUES ($1,$2,$3,$4,'facebook','text')`,
          [targetId, postId, workspaceId, destinationId],
        )
        await expect(
          client.query(`DELETE FROM "PublishDestination" WHERE id = $1`, [
            destinationId,
          ]),
        ).rejects.toThrow()
        await client.query(`DELETE FROM "SocialPostTarget" WHERE id = $1`, [
          targetId,
        ])
        await client.query(`DELETE FROM "PublishDestination" WHERE id = $1`, [
          destinationId,
        ])
      })

      test("deleting the inbox cascades to its binding and the binding's schedule", async () => {
        const inboxId = await insertInbox(workspaceId, "threads")
        const [binding] = await publishDestinationRepository.ensureForInboxes(
          { inboxIds: [inboxId], workspaceId },
          database() as never,
        )
        await client.query(
          `INSERT INTO "PublishDestinationSchedule" ("id","workspaceId","publishDestinationId") VALUES ($1,$2,$3)`,
          [nextId(), workspaceId, binding.id],
        )
        await client.query(`DELETE FROM "Inbox" WHERE id = $1`, [inboxId])
        const left = await client.query(
          `SELECT (SELECT count(*) FROM "PublishDestination" WHERE id = $1)
              + (SELECT count(*) FROM "PublishDestinationSchedule" WHERE "publishDestinationId" = $1) AS n`,
          [binding.id],
        )
        expect(Number(left.rows[0].n)).toBe(0)
      })

      test("the queue slot is unique per destination", async () => {
        const destinationId = await insertPublishDestination(
          database() as never,
          {
            label: "queue",
            workspaceId,
          },
        )
        const slot = new Date(Date.now() + 86_400_000)
        const insertTarget = async () => {
          const postId = nextId()
          await socialPostRepository.insertPost(
            {
              createdById: null,
              createdVia: "api",
              id: postId,
              idempotencyKey: null,
              idempotencyRequestHash: null,
              linkUrl: null,
              text: "x",
              workspaceId,
            },
            database() as never,
          )
          await client.query(
            `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType","queueSlotAt")
           VALUES ($1,$2,$3,$4,'facebook','text',$5)`,
            [nextId(), postId, workspaceId, destinationId, slot],
          )
        }
        await insertTarget()
        await expect(insertTarget()).rejects.toThrow("queueSlotAt_key")
      })
    })

    describe("workspace purge", () => {
      test("drains the binding's dependents before its targets and the binding, bounded, leaving another workspace alone", async () => {
        const db = database()
        const [workspace] = await db
          .insert(schema.workspaceModel)
          .values({ name: `pd-purge-${nextId()}`, ownerId: userId })
          .returning({ id: schema.workspaceModel.id })
        const destinations: string[] = []
        for (let index = 0; index < 5; index++) {
          destinations.push(
            await insertPublishDestination(db as never, {
              label: `purge-${index}`,
              workspaceId: workspace.id,
            }),
          )
        }
        for (const destinationId of destinations) {
          await client.query(
            `INSERT INTO "PublishDestinationSchedule" ("id","workspaceId","publishDestinationId") VALUES ($1,$2,$3)`,
            [nextId(), workspace.id, destinationId],
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
              text: "x",
              workspaceId: workspace.id,
            },
            db as never,
          )
          await client.query(
            `INSERT INTO "SocialPostTarget" ("id","socialPostId","workspaceId","publishDestinationId","provider","contentType")
             VALUES ($1,$2,$3,$4,'facebook','text')`,
            [nextId(), postId, workspace.id, destinationId],
          )
        }
        const kept = await insertPublishDestination(db as never, {
          label: "kept",
          workspaceId,
        })

        const tables = [
          "PublishDestinationSchedule",
          "SocialPostTarget",
          "PublishDestination",
        ] as const
        // The binding drains after its dependents and its targets (RESTRICT).
        const order = tables.map((table) =>
          HEAVY_WORKSPACE_TABLES.indexOf(table),
        )
        expect(order.every((position) => position >= 0)).toBe(true)
        expect([...order].sort((a, b) => a - b)).toEqual(order)

        const batch = 2
        for (const table of tables) {
          let total = 0
          for (let drained = batch; drained === batch; ) {
            drained = await workspacePurgeRepository.deleteWorkspaceRowsBatch(
              table,
              workspace.id,
              batch,
              db as never,
            )
            total += drained
            expect(drained).toBeLessThanOrEqual(batch)
          }
          expect(total).toBe(5)
        }
        expect(
          (
            await client.query(
              `SELECT 1 FROM "PublishDestination" WHERE id = $1`,
              [kept],
            )
          ).rowCount,
        ).toBe(1)
      })
    })
  },
)
