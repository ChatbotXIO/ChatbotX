// @vitest-environment node

/**
 * The composed-post tables against a real database: the idempotency and
 * target unique keys, the RESTRICT on a destination that has targets, the
 * cascades and SET NULL, the keyset list with its filters, workspace scoping,
 * and the edit/delete guards.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { socialPostRepository } from "../../src/repositories/social-post/repository"
import {
  HEAVY_WORKSPACE_TABLES,
  PARTITIONED_WORKSPACE_TABLES,
  workspacePurgeRepository,
} from "../../src/repositories/workspace-purge"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"
import { insertPublishDestination } from "./publish-destination-fixture"

const databaseUrl = realDatabaseUrl()

type Fixture = {
  destinationId: string
  otherDestinationId: string
  otherWorkspaceId: string
  topicId: string
  userId: string
  workspaceId: string
}

describe.skipIf(!databaseUrl)("composed posts against a real database", () => {
  let client: Client
  let fixture: Fixture
  let sequence = 0
  const nextId = () => `${Date.now()}${String(++sequence).padStart(6, "0")}`
  const database = () => drizzle({ client, relations, schema })

  const post = (
    overrides: Partial<
      Parameters<typeof socialPostRepository.insertPost>[0]
    > = {},
  ) => ({
    createdById: null,
    createdVia: "api" as const,
    id: nextId(),
    idempotencyKey: null,
    idempotencyRequestHash: null,
    linkUrl: null,
    text: "hello",
    workspaceId: fixture.workspaceId,
    ...overrides,
  })

  const target = (
    socialPostId: string,
    destinationId = fixture.destinationId,
  ) => ({
    contentType: "text" as const,
    id: nextId(),
    options: {},
    overridesMedia: false,
    provider: "facebook" as const,
    scheduleMode: "custom" as const,
    publishDestinationId: destinationId,
    socialPostId,
    textOverride: null,
    workspaceId: fixture.workspaceId,
  })

  const count = async (table: string, where: string, value: string) =>
    Number(
      (
        await client.query(
          `SELECT count(*)::int AS n FROM "${table}" WHERE "${where}" = $1`,
          [value],
        )
      ).rows[0].n,
    )

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `post-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const workspaces = await db
      .insert(schema.workspaceModel)
      .values([
        { name: `post-${suffix}`, ownerId: user.id },
        { name: `post-other-${suffix}`, ownerId: user.id },
      ])
      .returning({ id: schema.workspaceModel.id })
    const [workspace, other] = workspaces
    const destinationFor = async (workspaceId: string, label: string) => {
      const destination = {
        id: await insertPublishDestination(db, {
          label,
          workspaceId,
        }),
      }
      return destination.id
    }
    const [topic] = await db
      .insert(schema.postTopicModel)
      .values({ name: `topic-${suffix}`, workspaceId: workspace.id })
      .returning({ id: schema.postTopicModel.id })
    fixture = {
      destinationId: await destinationFor(workspace.id, "mine"),
      otherDestinationId: await destinationFor(other.id, "theirs"),
      otherWorkspaceId: other.id,
      topicId: topic.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  })

  afterAll(async () => {
    if (fixture) {
      const db = database()
      await client.query(
        `DELETE FROM "SocialPostTarget" WHERE "workspaceId" = ANY($1::bigint[])`,
        [[fixture.workspaceId, fixture.otherWorkspaceId]],
      )
      for (const id of [fixture.workspaceId, fixture.otherWorkspaceId]) {
        await db
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, id))
      }
      await db
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, fixture.userId))
    }
    await client.end()
  })

  test("the idempotency key is unique per workspace, and free in another one", async () => {
    const db = database()
    const first = await socialPostRepository.insertPost(
      post({ idempotencyKey: "k-1" }),
      db,
    )
    const repeat = await socialPostRepository.insertPost(
      post({ idempotencyKey: "k-1" }),
      db,
    )
    const elsewhere = await socialPostRepository.insertPost(
      post({ idempotencyKey: "k-1", workspaceId: fixture.otherWorkspaceId }),
      db,
    )
    expect(first).not.toBeNull()
    expect(repeat).toBeNull()
    expect(elsewhere).not.toBeNull()
    expect(
      (
        await socialPostRepository.findByIdempotencyKey(
          { idempotencyKey: "k-1", workspaceId: fixture.workspaceId },
          db,
        )
      )?.id,
    ).toBe(first?.id)
  })

  test("posts without a key never conflict", async () => {
    const db = database()
    expect(await socialPostRepository.insertPost(post(), db)).not.toBeNull()
    expect(await socialPostRepository.insertPost(post(), db)).not.toBeNull()
  })

  test("a destination can be a post's target only once", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    await socialPostRepository.insertTargets([target(id)], db)
    await expect(
      socialPostRepository.insertTargets([target(id)], db),
    ).rejects.toThrow()
  })

  test("a destination with targets cannot be deleted (RESTRICT), and can once they are gone", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    const row = target(id)
    await socialPostRepository.insertTargets([row], db)
    await expect(
      client.query(`DELETE FROM "PublishDestination" WHERE id = $1`, [
        fixture.destinationId,
      ]),
    ).rejects.toThrow()
    await client.query(`DELETE FROM "SocialPostTarget" WHERE id = $1`, [row.id])
  })

  test("deleting a post cascades to its targets, files and topic links", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    const row = target(id)
    await socialPostRepository.insertTargets([row], db)
    const media = {
      altText: null,
      durationMs: null,
      height: null,
      id: nextId(),
      kind: "image" as const,
      mediaLibraryFileId: null,
      mimeType: "image/jpeg",
      path: `public/space/${fixture.workspaceId}/media-library/x`,
      position: 0,
      size: 10,
      width: null,
      workspaceId: fixture.workspaceId,
    }
    await socialPostRepository.insertPostMedia(
      { rows: [media], socialPostId: id },
      db,
    )
    await socialPostRepository.insertTargetMedia(
      { rows: [{ ...media, id: nextId() }], socialPostTargetId: row.id },
      db,
    )
    await socialPostRepository.replaceTopics(
      { postTopicIds: [fixture.topicId], socialPostId: id },
      db,
    )

    expect(
      await socialPostRepository.deleteDraft(
        { id, workspaceId: fixture.workspaceId },
        db,
      ),
    ).toBe(true)

    expect(await count("SocialPostTarget", "socialPostId", id)).toBe(0)
    expect(await count("SocialPostMedia", "socialPostId", id)).toBe(0)
    expect(
      await count("SocialPostTargetMedia", "socialPostTargetId", row.id),
    ).toBe(0)
    expect(await count("SocialPostToPostTopic", "socialPostId", id)).toBe(0)
  })

  test("a file removed from the library leaves its post media row with a null reference (SET NULL)", async () => {
    const db = database()
    const [file] = await db
      .insert(schema.mediaLibraryFileModel)
      .values({
        mimeType: "image/jpeg",
        name: "a.jpg",
        path: `public/space/${fixture.workspaceId}/media-library/${nextId()}`,
        size: 5,
        workspaceId: fixture.workspaceId,
      })
      .returning({
        id: schema.mediaLibraryFileModel.id,
        path: schema.mediaLibraryFileModel.path,
      })
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    const rowId = nextId()
    await socialPostRepository.insertPostMedia(
      {
        rows: [
          {
            altText: null,
            durationMs: null,
            height: null,
            id: rowId,
            kind: "image",
            mediaLibraryFileId: file.id,
            mimeType: "image/jpeg",
            path: file.path,
            position: 0,
            size: 5,
            width: null,
            workspaceId: fixture.workspaceId,
          },
        ],
        socialPostId: id,
      },
      db,
    )
    await db
      .delete(schema.mediaLibraryFileModel)
      .where(eq(schema.mediaLibraryFileModel.id, file.id))
    const rows = await client.query(
      `SELECT "mediaLibraryFileId" FROM "SocialPostMedia" WHERE id = $1`,
      [rowId],
    )
    expect(rows.rows[0].mediaLibraryFileId).toBeNull()
  })

  test("two files of one post cannot share a position", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    const media = (position: number) => ({
      altText: null,
      durationMs: null,
      height: null,
      id: nextId(),
      kind: "image" as const,
      mediaLibraryFileId: null,
      mimeType: "image/jpeg",
      path: "p",
      position,
      size: 1,
      width: null,
      workspaceId: fixture.workspaceId,
    })
    await expect(
      socialPostRepository.insertPostMedia(
        { rows: [media(0), media(0)], socialPostId: id },
        db,
      ),
    ).rejects.toThrow()
  })

  test("the list pages newest first by (createdAt, id) and never leaks another workspace", async () => {
    const db = database()
    const ids: string[] = []
    for (const [index, text] of [
      "page-one",
      "page-two",
      "page-three",
    ].entries()) {
      const created = await socialPostRepository.insertPost(post({ text }), db)
      ids.push(created?.id ?? "")
      await client.query(
        `UPDATE "SocialPost" SET "createdAt" = now() + ($2 || ' seconds')::interval WHERE id = $1`,
        [created?.id, String(1000 + index)],
      )
    }
    await socialPostRepository.insertPost(
      post({ text: "page-foreign", workspaceId: fixture.otherWorkspaceId }),
      db,
    )

    const first = await socialPostRepository.list(
      {
        filters: { search: "page-" },
        limit: 2,
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    expect(first).toHaveLength(3)
    expect(first.slice(0, 2).map((row) => row.text)).toEqual([
      "page-three",
      "page-two",
    ])
    const last = first[1]
    const next = await socialPostRepository.list(
      {
        cursor: { createdAt: last.createdAtText, id: last.id },
        filters: { search: "page-" },
        limit: 2,
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    expect(next.map((row) => row.text)).toEqual(["page-one"])
  })

  test("the list filters by provider, account, topic and status", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(
      post({ text: "filter-me" }),
      db,
    )
    const id = created?.id ?? ""
    await socialPostRepository.insertTargets([target(id)], db)
    await socialPostRepository.replaceTopics(
      { postTopicIds: [fixture.topicId], socialPostId: id },
      db,
    )
    const inboxId = (
      await client.query(
        `SELECT "inboxId" FROM "PublishDestination" WHERE id = $1`,
        [fixture.destinationId],
      )
    ).rows[0].inboxId as string

    const base = { limit: 10, workspaceId: fixture.workspaceId }
    const match = async (
      filters: Parameters<typeof socialPostRepository.list>[0]["filters"],
    ) =>
      (
        await socialPostRepository.list(
          { ...base, filters: { search: "filter-me", ...filters } },
          db,
        )
      ).map((row) => row.id)

    expect(await match({ providers: ["facebook"] })).toEqual([id])
    expect(await match({ providers: ["threads"] })).toEqual([])
    expect(await match({ inboxIds: [inboxId] })).toEqual([id])
    expect(await match({ topicIds: [fixture.topicId] })).toEqual([id])
    expect(await match({ statuses: ["draft"] })).toEqual([id])
    expect(await match({ statuses: ["published"] })).toEqual([])

    // Another workspace never sees the post through any filter or join.
    const foreign = { limit: 10, workspaceId: fixture.otherWorkspaceId }
    for (const filters of [
      { providers: ["facebook" as const] },
      { inboxIds: [inboxId] },
      { topicIds: [fixture.topicId] },
    ]) {
      expect(
        await socialPostRepository.list(
          { ...foreign, filters: { search: "filter-me", ...filters } },
          db,
        ),
      ).toEqual([])
    }
    expect(
      await socialPostRepository.listTargets(
        { postIds: [id], workspaceId: fixture.otherWorkspaceId },
        db,
      ),
    ).toEqual([])
  })

  test("destinations of another workspace are not found", async () => {
    const db = database()
    const found = await socialPostRepository.findDestinations(
      {
        ids: [fixture.destinationId, fixture.otherDestinationId],
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    expect(found.map((row) => row.id)).toEqual([fixture.destinationId])
  })

  test("only a draft or scheduled post can be edited, and only a draft deleted", async () => {
    const db = database()
    const created = await socialPostRepository.insertPost(post(), db)
    const id = created?.id ?? ""
    const scope = { id, workspaceId: fixture.workspaceId }
    expect(
      await socialPostRepository.updateEditable(
        { ...scope, text: "changed" },
        db,
      ),
    ).toBe(true)
    await client.query(
      `UPDATE "SocialPost" SET status = 'published' WHERE id = $1`,
      [id],
    )
    expect(
      await socialPostRepository.updateEditable(
        { ...scope, text: "again" },
        db,
      ),
    ).toBe(false)
    expect(await socialPostRepository.deleteDraft(scope, db)).toBe(false)
    expect(
      await socialPostRepository.updateEditable(
        { id, text: "x", workspaceId: fixture.otherWorkspaceId },
        db,
      ),
    ).toBe(false)
  })

  test("a workspace deletes once its targets are drained first", async () => {
    const db = database()
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({
        name: `drain-${Date.now()}-${Math.random()}`,
        ownerId: fixture.userId,
      })
      .returning({ id: schema.workspaceModel.id })
    const destination = {
      id: await insertPublishDestination(db, {
        label: "d",
        workspaceId: workspace.id,
      }),
    }
    const created = await socialPostRepository.insertPost(
      post({ workspaceId: workspace.id }),
      db,
    )
    await socialPostRepository.insertTargets(
      [
        {
          ...target(created?.id ?? "", destination.id),
          workspaceId: workspace.id,
        },
      ],
      db,
    )
    // The purge drains targets before the final cascade (`HEAVY_WORKSPACE_TABLES`).
    await client.query(
      `DELETE FROM "SocialPostTarget" WHERE "workspaceId" = $1`,
      [workspace.id],
    )
    await db
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, workspace.id))
    expect(await count("SocialPost", "workspaceId", workspace.id)).toBe(0)
    expect(await count("PublishDestination", "workspaceId", workspace.id)).toBe(
      0,
    )
  })

  describe("workspace purge drains", () => {
    const topicLinkSpec = PARTITIONED_WORKSPACE_TABLES.find(
      (spec) => spec.table === "SocialPostToPostTopic",
    )

    test("the posts' children drain before the posts, and the topic links before both", () => {
      const heavy = [...HEAVY_WORKSPACE_TABLES]
      const order = [
        "SocialPostTargetMedia",
        "SocialPostTarget",
        "SocialPostMedia",
        "SocialPost",
      ].map((table) => heavy.indexOf(table as (typeof heavy)[number]))

      expect(order.every((index) => index >= 0)).toBe(true)
      expect(order).toEqual([...order].sort((a, b) => a - b))
      expect(topicLinkSpec?.selector).toBe("socialPostWorkspace")
    })

    test("drains a workspace in bounded batches, children first, leaving another workspace alone", async () => {
      const db = database()
      const [workspace] = await db
        .insert(schema.workspaceModel)
        .values({
          name: `purge-${Date.now()}-${Math.random()}`,
          ownerId: fixture.userId,
        })
        .returning({ id: schema.workspaceModel.id })
      const destination = {
        id: await insertPublishDestination(db, {
          label: "p",
          workspaceId: workspace.id,
        }),
      }
      const [topic] = await db
        .insert(schema.postTopicModel)
        .values({
          name: `purge-topic-${Date.now()}`,
          workspaceId: workspace.id,
        })
        .returning({ id: schema.postTopicModel.id })

      const postIds: string[] = []
      for (let index = 0; index < 5; index++) {
        const created = await socialPostRepository.insertPost(
          post({ workspaceId: workspace.id }),
          db,
        )
        const id = created?.id ?? ""
        postIds.push(id)
        const row = { ...target(id, destination.id), workspaceId: workspace.id }
        await socialPostRepository.insertTargets([row], db)
        const media = {
          altText: null,
          durationMs: null,
          height: null,
          id: nextId(),
          kind: "image" as const,
          mediaLibraryFileId: null,
          mimeType: "image/jpeg",
          path: "p",
          position: 0,
          size: 1,
          width: null,
          workspaceId: workspace.id,
        }
        await socialPostRepository.insertPostMedia(
          { rows: [media], socialPostId: id },
          db,
        )
        await socialPostRepository.insertTargetMedia(
          { rows: [{ ...media, id: nextId() }], socialPostTargetId: row.id },
          db,
        )
        await socialPostRepository.replaceTopics(
          { postTopicIds: [topic.id], socialPostId: id },
          db,
        )
      }
      // Another workspace's data must survive every batch.
      const kept = await socialPostRepository.insertPost(post(), db)
      await socialPostRepository.replaceTopics(
        { postTopicIds: [fixture.topicId], socialPostId: kept?.id ?? "" },
        db,
      )

      const batch = 2
      // Topic links first (through their post), in batches of two.
      let links = 0
      for (let drained = batch; drained === batch; ) {
        drained = await workspacePurgeRepository.deletePartitionedBatch(
          topicLinkSpec as NonNullable<typeof topicLinkSpec>,
          workspace.id,
          batch,
          db,
        )
        links += drained
        expect(drained).toBeLessThanOrEqual(batch)
      }
      expect(links).toBe(5)
      expect(
        await workspacePurgeRepository.hasPartitionedWorkspaceRows(
          topicLinkSpec as NonNullable<typeof topicLinkSpec>,
          workspace.id,
          db,
        ),
      ).toBe(false)

      for (const table of [
        "SocialPostTargetMedia",
        "SocialPostTarget",
        "SocialPostMedia",
        "SocialPost",
      ] as const) {
        let total = 0
        for (let drained = batch; drained === batch; ) {
          drained = await workspacePurgeRepository.deleteWorkspaceRowsBatch(
            table,
            workspace.id,
            batch,
            db,
          )
          total += drained
          expect(drained).toBeLessThanOrEqual(batch)
        }
        expect(total).toBe(5)
      }

      // The destination (RESTRICT) can now go with the workspace, and the other
      // workspace's post and its topic link are untouched.
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspace.id))
      expect(await count("SocialPost", "workspaceId", workspace.id)).toBe(0)
      expect(
        await count("SocialPostToPostTopic", "socialPostId", kept?.id ?? ""),
      ).toBe(1)
    })
  })
})
