// @vitest-environment node

/**
 * The reads behind a post's comments window against a real database: the
 * conversations of a post, the commenters with their tags, the author list and
 * filter, the PostgreSQL form of the phone rule, and that the thread lookup is
 * served by its partial index.
 *
 * Runs only against an explicitly configured local database after the approved
 * migrations were applied: `pnpm --filter @chatbotx.io/database test:db`.
 */

import {
  hasPhoneNumber,
  PHONE_NUMBER_REDACTION_SQL_PATTERN,
  PHONE_NUMBER_SQL_PATTERN,
  redactPhoneNumbers,
} from "@chatbotx.io/utils/has-phone-number"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import {
  MAX_COMMENT_THREADS_PER_READ,
  postCommentRepository,
} from "../../src/repositories/channel-post/comments"
import { channelPostManagementRepository } from "../../src/repositories/channel-post/management"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

type Fixture = {
  contactIds: string[]
  inboxId: string
  otherInboxId: string
  userId: string
  workspaceId: string
}

describe.skipIf(!databaseUrl)("post comments against a real database", () => {
  let client: Client
  let fixture: Fixture
  let otherWorkspaceId: string
  const conversationIds: string[] = []
  const suffix = `${Date.now()}-${Math.random()}`
  const postA = `post-a-${suffix}`
  const postB = `post-b-${suffix}`
  const postDup = `post-dup-${suffix}`
  const postMerged = `post-merged-${suffix}`
  const extra: {
    dupContactId: string
    dupConversationId: string
    mergedContactId: string
    mergedConversationId: string
    mergedContactInboxIds: { inboxId: string; id: string }[]
  } = {
    dupContactId: "",
    dupConversationId: "",
    mergedContactId: "",
    mergedConversationId: "",
    mergedContactInboxIds: [],
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const database = drizzle({ client, relations, schema })
    const [user] = await database
      .insert(schema.userModel)
      .values({ email: `post-comments-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await database
      .insert(schema.workspaceModel)
      .values({ name: `post-comments-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [other] = await database
      .insert(schema.workspaceModel)
      .values({ name: `post-comments-other-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    otherWorkspaceId = other.id
    const [inbox] = await database
      .insert(schema.inboxModel)
      .values({
        channel: "messenger",
        name: `Messenger ${suffix}`,
        sourceId: `messenger-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })

    const contacts = await database
      .insert(schema.contactModel)
      .values([
        {
          firstName: "An",
          lastName: "Nguyen",
          phoneNumber: "0901234567",
          workspaceId: workspace.id,
        },
        { firstName: "Binh", workspaceId: workspace.id },
        { firstName: "Chi", workspaceId: workspace.id },
      ])
      .returning({ id: schema.contactModel.id })
    const [otherInbox] = await database
      .insert(schema.inboxModel)
      .values({
        channel: "messenger",
        name: `Messenger other ${suffix}`,
        sourceId: `messenger-other-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })
    // Contacts 0-1 reach us through `inbox`; contact 2 only through the other inbox.
    await database.insert(schema.contactInboxModel).values([
      ...[0, 1].map((index) => ({
        channel: "messenger",
        contactId: contacts[index].id,
        inboxId: inbox.id,
        originalContactId: contacts[index].id,
        source: "messenger",
        sourceId: `psid-${suffix}-${index}`,
      })),
      {
        channel: "messenger",
        contactId: contacts[2].id,
        inboxId: otherInbox.id,
        originalContactId: contacts[2].id,
        source: "messenger",
        sourceId: `psid-${suffix}-2`,
      },
    ])
    fixture = {
      contactIds: contacts.map((contact) => contact.id),
      inboxId: inbox.id,
      otherInboxId: otherInbox.id,
      userId: user.id,
      workspaceId: workspace.id,
    }

    const [vip, gone] = await database
      .insert(schema.tagModel)
      .values([
        { name: `VIP ${suffix}`, workspaceId: workspace.id },
        {
          deletedAt: new Date(),
          name: `Gone ${suffix}`,
          workspaceId: workspace.id,
        },
      ])
      .returning({ id: schema.tagModel.id })
    await database.insert(schema.contactsToTagsModel).values([
      { contactId: contacts[0].id, tagId: vip.id },
      { contactId: contacts[0].id, tagId: gone.id },
    ])

    // Post A: all three contacts commented (the third newest). Post B: one.
    // A conversation of another workspace with the same source id must not show.
    const rows = await database
      .insert(schema.conversationModel)
      .values([
        {
          contactId: contacts[0].id,
          lastActivityAt: new Date("2026-11-20T10:00:00Z"),
          sourceId: postA,
          workspaceId: workspace.id,
        },
        {
          contactId: contacts[1].id,
          lastActivityAt: new Date("2026-11-21T10:00:00Z"),
          sourceId: postA,
          workspaceId: workspace.id,
        },
        {
          contactId: contacts[2].id,
          lastActivityAt: new Date("2026-11-22T10:00:00Z"),
          sourceId: postA,
          workspaceId: workspace.id,
        },
        {
          contactId: contacts[0].id,
          lastActivityAt: new Date("2026-11-22T10:00:00Z"),
          sourceId: postB,
          workspaceId: workspace.id,
        },
        // The contact's direct-message conversation has no source id.
        { contactId: contacts[0].id, workspaceId: workspace.id },
      ])
      .returning({ id: schema.conversationModel.id })
    conversationIds.push(...rows.map((row) => row.id))

    const otherContact = await database
      .insert(schema.contactModel)
      .values({ firstName: "Other", workspaceId: other.id })
      .returning({ id: schema.contactModel.id })
    await database.insert(schema.conversationModel).values({
      contactId: otherContact[0].id,
      sourceId: postA,
      workspaceId: other.id,
    })

    // A contact with TWO contact-inbox rows in one inbox (a re-created link), and
    // a contact merged across both inboxes: neither may repeat a conversation.
    const [dup, merged] = await database
      .insert(schema.contactModel)
      .values([
        { firstName: "Dup", workspaceId: workspace.id },
        { firstName: "Merged", workspaceId: workspace.id },
      ])
      .returning({ id: schema.contactModel.id })
    const contactInboxRows = await database
      .insert(schema.contactInboxModel)
      .values([
        ...[1, 2].map((n) => ({
          channel: "messenger",
          contactId: dup.id,
          inboxId: inbox.id,
          originalContactId: dup.id,
          source: "messenger",
          sourceId: `psid-dup-${suffix}-${n}`,
        })),
        {
          channel: "messenger",
          contactId: merged.id,
          inboxId: inbox.id,
          originalContactId: merged.id,
          source: "messenger",
          sourceId: `psid-merged-a-${suffix}`,
        },
        {
          channel: "messenger",
          contactId: merged.id,
          inboxId: otherInbox.id,
          originalContactId: merged.id,
          source: "messenger",
          sourceId: `psid-merged-b-${suffix}`,
        },
      ])
      .returning({
        id: schema.contactInboxModel.id,
        inboxId: schema.contactInboxModel.inboxId,
        contactId: schema.contactInboxModel.contactId,
      })
    const [dupConversation, mergedConversation] = await database
      .insert(schema.conversationModel)
      .values([
        {
          contactId: dup.id,
          lastActivityAt: new Date("2026-11-23T10:00:00Z"),
          sourceId: postDup,
          workspaceId: workspace.id,
        },
        {
          contactId: merged.id,
          lastActivityAt: new Date("2026-11-23T11:00:00Z"),
          sourceId: postMerged,
          workspaceId: workspace.id,
        },
      ])
      .returning({ id: schema.conversationModel.id })
    extra.dupContactId = dup.id
    extra.dupConversationId = dupConversation.id
    extra.mergedContactId = merged.id
    extra.mergedConversationId = mergedConversation.id
    extra.mergedContactInboxIds = contactInboxRows
      .filter((row) => row.contactId === merged.id)
      .map((row) => ({ id: row.id, inboxId: row.inboxId }))

    // Authors for the author list and filter.
    const author = (
      index: number,
      authorExternalId: string | null,
      authorName: string | null,
      removed = false,
    ) => ({
      authorExternalId,
      authorName,
      channel: "messenger",
      externalPostId: `author-post-${suffix}-${index}`,
      inboxId: inbox.id,
      integrationId: "1",
      removedAt: removed ? new Date() : null,
      sourceAccountId: `account-${suffix}`,
      workspaceId: workspace.id,
    })
    await database
      .insert(schema.channelPostModel)
      .values([
        author(1, "page-1", "Shop"),
        author(2, "page-1", "Shop (renamed)"),
        author(3, "page-1", "Shop"),
        author(4, "page-2", "Blog"),
        author(5, "page-2", "Blog"),
        author(6, "page-3", "Zed"),
        author(7, null, null),
        author(8, "page-gone", "Removed", true),
      ])
  })

  afterAll(async () => {
    if (fixture) {
      const database = drizzle({ client, relations, schema })
      for (const id of [fixture.workspaceId, otherWorkspaceId]) {
        await database
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, id))
      }
      await database
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, fixture.userId))
    }
    await client?.end()
  })

  describe("findThreads", () => {
    const keyA = () => ({ externalPostId: postA, inboxId: fixture.inboxId })
    const keyB = () => ({ externalPostId: postB, inboxId: fixture.inboxId })

    test("returns the conversations of the post, in its inbox, most recently active first", async () => {
      const threads = await postCommentRepository.findThreads({
        posts: [keyA()],
        workspaceId: fixture.workspaceId,
      })

      // Contact 2 comments on the post too but reaches us through another inbox.
      expect(threads.map((thread) => thread.contactId)).toEqual([
        fixture.contactIds[1],
        fixture.contactIds[0],
      ])
      expect(threads.every((thread) => thread.postExternalId === postA)).toBe(
        true,
      )
    })

    test("a post of the other inbox that shares the external id gets its own threads", async () => {
      const threads = await postCommentRepository.findThreads({
        posts: [{ externalPostId: postA, inboxId: fixture.otherInboxId }],
        workspaceId: fixture.workspaceId,
      })

      expect(threads.map((thread) => thread.contactId)).toEqual([
        fixture.contactIds[2],
      ])
    })

    test("never returns the direct-message conversation or another workspace's thread", async () => {
      const threads = await postCommentRepository.findThreads({
        posts: [keyA(), keyB()],
        workspaceId: fixture.workspaceId,
      })

      expect(threads).toHaveLength(3)
      expect(threads.map((thread) => thread.id)).not.toContain(
        conversationIds[4],
      )
    })

    test("merges several posts in one query and tags each thread with its post", async () => {
      const threads = await postCommentRepository.findThreads({
        posts: [keyA(), keyB()],
        workspaceId: fixture.workspaceId,
      })

      expect(
        threads.filter((thread) => thread.postExternalId === postB),
      ).toEqual([
        {
          contactId: fixture.contactIds[0],
          id: conversationIds[3],
          postExternalId: postB,
        },
      ])
    })

    test("a contact with two contact-inbox rows in the inbox still yields one thread", async () => {
      const threads = await postCommentRepository.findThreads({
        posts: [{ externalPostId: postDup, inboxId: fixture.inboxId }],
        workspaceId: fixture.workspaceId,
      })

      expect(threads).toEqual([
        {
          contactId: extra.dupContactId,
          id: extra.dupConversationId,
          postExternalId: postDup,
        },
      ])
    })

    test("duplicated contact-inbox rows do not use the cap twice", async () => {
      // Every thread of the read counts once towards the cap: the whole fixture
      // of the workspace, asked for at once, has exactly one row per conversation.
      const threads = await postCommentRepository.findThreads({
        posts: [
          { externalPostId: postA, inboxId: fixture.inboxId },
          { externalPostId: postB, inboxId: fixture.inboxId },
          { externalPostId: postDup, inboxId: fixture.inboxId },
          { externalPostId: postMerged, inboxId: fixture.inboxId },
        ],
        workspaceId: fixture.workspaceId,
      })

      const ids = threads.map((thread) => thread.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain(extra.dupConversationId)
      expect(ids).toContain(extra.mergedConversationId)
    })

    test("a contact merged across two inboxes yields one thread, also when both inboxes' posts are asked for", async () => {
      const both = await postCommentRepository.findThreads({
        posts: [
          { externalPostId: postMerged, inboxId: fixture.inboxId },
          { externalPostId: postMerged, inboxId: fixture.otherInboxId },
        ],
        workspaceId: fixture.workspaceId,
      })
      const onlyA = await postCommentRepository.findThreads({
        posts: [{ externalPostId: postMerged, inboxId: fixture.inboxId }],
        workspaceId: fixture.workspaceId,
      })

      expect(both.map((thread) => thread.id)).toEqual([
        extra.mergedConversationId,
      ])
      expect(onlyA.map((thread) => thread.id)).toEqual([
        extra.mergedConversationId,
      ])
    })

    test("the lookup is served by the partial (workspaceId, sourceId, lastActivityAt, id) index", async () => {
      await client.query("SET enable_seqscan = off")
      try {
        const plan = await client.query<{ "QUERY PLAN": string }>(
          `EXPLAIN SELECT id, "contactId" FROM "Conversation"
           WHERE "workspaceId" = $1 AND "sourceId" = $2
           ORDER BY "lastActivityAt" DESC NULLS LAST, id DESC LIMIT ${MAX_COMMENT_THREADS_PER_READ}`,
          [fixture.workspaceId, postA],
        )

        expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
          "Conversation_workspaceId_sourceId_lastActivityAt_id_idx",
        )
      } finally {
        await client.query("RESET enable_seqscan")
      }
    })
  })

  describe("findContactInboxes", () => {
    test("returns the contact's rows in the asked inboxes only, so each post reads its own inbox", async () => {
      const inA = await postCommentRepository.findContactInboxes({
        contactIds: [extra.mergedContactId],
        inboxIds: [fixture.inboxId],
      })
      const inBoth = await postCommentRepository.findContactInboxes({
        contactIds: [extra.mergedContactId],
        inboxIds: [fixture.inboxId, fixture.otherInboxId],
      })

      expect(inA.map((row) => row.inboxId)).toEqual([fixture.inboxId])
      expect(inBoth.map((row) => row.inboxId).sort()).toEqual(
        [fixture.inboxId, fixture.otherInboxId].sort(),
      )
      // The ids a comment's `contactInboxId` is matched against.
      expect(inBoth.map((row) => row.id).sort()).toEqual(
        extra.mergedContactInboxIds.map((row) => row.id).sort(),
      )
    })

    test("a contact with two rows in one inbox returns both, for the message filter", async () => {
      const rows = await postCommentRepository.findContactInboxes({
        contactIds: [extra.dupContactId],
        inboxIds: [fixture.inboxId],
      })

      expect(rows).toHaveLength(2)
    })

    test("a contact of no asked inbox returns nothing", async () => {
      expect(
        await postCommentRepository.findContactInboxes({
          contactIds: [fixture.contactIds[2]],
          inboxIds: [fixture.inboxId],
        }),
      ).toEqual([])
    })
  })

  describe("findCommenters", () => {
    test("returns name, avatar, phone and live tags in two batched queries", async () => {
      const commenters = await postCommentRepository.findCommenters({
        contactIds: fixture.contactIds,
        workspaceId: fixture.workspaceId,
      })

      const an = commenters.find(
        (commenter) => commenter.id === fixture.contactIds[0],
      )
      expect(an).toMatchObject({
        name: "An Nguyen",
        phoneNumber: "0901234567",
      })
      // The soft-deleted tag is not shown.
      expect(an?.tags.map((tag) => tag.name)).toEqual([`VIP ${suffix}`])
      expect(
        commenters.find((commenter) => commenter.id === fixture.contactIds[1]),
      ).toMatchObject({ name: "Binh", phoneNumber: null, tags: [] })
    })

    test("another workspace's workspace id returns nothing", async () => {
      expect(
        await postCommentRepository.findCommenters({
          contactIds: fixture.contactIds,
          workspaceId: otherWorkspaceId,
        }),
      ).toEqual([])
    })
  })

  describe("authors", () => {
    test("lists distinct authors by posts count, then name, without unknown or removed ones", async () => {
      const authors = await channelPostManagementRepository.listAuthors({
        workspaceId: fixture.workspaceId,
      })

      expect(
        authors.map((author) => [author.authorExternalId, author.postsCount]),
      ).toEqual([
        ["page-1", 3],
        ["page-2", 2],
        ["page-3", 1],
      ])
      // A renamed author shows once, under one of their names.
      expect(authors[0].authorName).toBe("Shop (renamed)")
    })

    test("narrows by channel and inbox", async () => {
      expect(
        await channelPostManagementRepository.listAuthors({
          channels: ["instagram"],
          workspaceId: fixture.workspaceId,
        }),
      ).toEqual([])
      expect(
        (
          await channelPostManagementRepository.listAuthors({
            inboxIds: [fixture.inboxId],
            workspaceId: fixture.workspaceId,
          })
        ).length,
      ).toBe(3)
    })

    test("the list filters by author id", async () => {
      const rows = await channelPostManagementRepository.list({
        filters: { authorIds: ["page-2", "page-3"], hasComments: false },
        limit: 50,
        sort: "newest",
        workspaceId: fixture.workspaceId,
      })

      expect(rows.map((row) => row.authorExternalId).sort()).toEqual([
        "page-2",
        "page-2",
        "page-3",
      ])
    })

    test("the author index serves the grouping", async () => {
      await client.query("SET enable_seqscan = off")
      try {
        const plan = await client.query<{ "QUERY PLAN": string }>(
          `EXPLAIN SELECT "authorExternalId", count(*) FROM "ChannelPost"
           WHERE "workspaceId" = $1 AND "authorExternalId" IS NOT NULL AND "removedAt" IS NULL
           GROUP BY "authorExternalId"`,
          [fixture.workspaceId],
        )

        expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
          "ChannelPost_workspaceId_authorExternalId_idx",
        )
      } finally {
        await client.query("RESET enable_seqscan")
      }
    })
  })

  describe("the phone rule in PostgreSQL", () => {
    test.each([
      "0912345678",
      "0912 345 678",
      "call me on 0912-345-678 please",
      "(028) 3822 1234",
      "+84 912 345 678",
      "+1 (415) 555-0132",
      "zalo 091.234.5678",
      "2026-11-22",
      "giá 1.500.000đ",
      "order #12345678",
      "",
      "nice shop",
      "order 12345",
      "call 12345",
      "1234567",
      "price 99",
      "12345678 ",
      "1234\t5678",
    ])("agrees with hasPhoneNumber on %j", async (text) => {
      const result = await client.query<{ matches: boolean }>(
        "SELECT $1::text ~ $2::text AS matches",
        [text, PHONE_NUMBER_SQL_PATTERN],
      )

      expect(result.rows[0].matches).toBe(hasPhoneNumber(text))
    })
  })

  describe("searching the text as a viewer without phone permission sees it", () => {
    const redacted = async (text: string) =>
      (
        await client.query<{ redacted: string }>(
          "SELECT regexp_replace($1::text, $2::text, '•••', 'g') AS redacted",
          [text, PHONE_NUMBER_REDACTION_SQL_PATTERN],
        )
      ).rows[0].redacted

    const found = async (text: string, search: string) =>
      (
        await client.query<{ matches: boolean }>(
          `SELECT regexp_replace($1::text, $2::text, '•••', 'g') ILIKE $3::text ESCAPE '\\' AS matches`,
          [text, PHONE_NUMBER_REDACTION_SQL_PATTERN, `%${search}%`],
        )
      ).rows[0].matches

    test.each([
      "call me on 0912345678 please",
      "zalo 091.234.5678 now",
      "+84 912 345 678",
      "(028) 3822 1234",
      "09 01 23 45 67",
      "0-9-0-1-2-3-4-5-6-7",
      "nice shop",
      "order 12345",
    ])("masks what redactPhoneNumbers masks in %j", async (text) => {
      const strip = (value: string) => value.replace(/\s+/g, "")

      expect(strip(await redacted(text))).toBe(strip(redactPhoneNumbers(text)))
    })

    test("a number written with separators cannot be probed by its digits", async () => {
      const text = "my number is 09 01 23 45 67 thanks"

      expect(await found(text, "0901")).toBe(false)
      expect(await found(text, "09 01")).toBe(false)
      expect(await found(text, "4567")).toBe(false)
      expect(await found(text, "01 23")).toBe(false)
      // The words around it are still found.
      expect(await found(text, "thanks")).toBe(true)
    })

    test("an ordinary search that has digits still works", async () => {
      expect(await found("big sale 2026 only", "2026")).toBe(true)
      expect(await found("iphone 15 pro", "15")).toBe(true)
      expect(await found("big sale 2026 only", "2027")).toBe(false)
    })

    test("a viewer who may see numbers can search them in the stored text", async () => {
      const stored = (
        await client.query<{ matches: boolean }>(
          `SELECT $1::text ILIKE $2::text ESCAPE '\\' AS matches`,
          ["my number is 09 01 23 45 67", "%09 01%"],
        )
      ).rows[0].matches

      expect(stored).toBe(true)
    })
  })

  describe("patching attributes with a JSON merge", () => {
    const merged = async (stored: string | null, key: string, value: boolean) =>
      (
        await client.query<{ attributes: Record<string, boolean> }>(
          `SELECT COALESCE($1::jsonb, '{}'::jsonb) || jsonb_build_object($2::text, $3::boolean) AS attributes`,
          [stored, key, value],
        )
      ).rows[0].attributes

    test("a key written meanwhile survives a patch of another key", async () => {
      // The job read `{hidden:false, liked:false}`; the comment path then set the
      // mark; the job's patch must keep it.
      expect(
        await merged(
          '{"hidden": false, "liked": false, "phoneCounted": true}',
          "hidden",
          true,
        ),
      ).toEqual({ hidden: true, liked: false, phoneCounted: true })
    })

    test("a row with no attributes yet takes just the patched key", async () => {
      expect(await merged(null, "liked", true)).toEqual({ liked: true })
    })

    test("the mark is set only where it is not set yet", async () => {
      const marked = async (stored: string | null) =>
        (
          await client.query<{ unmarked: boolean }>(
            `SELECT NOT (COALESCE($1::jsonb->>'phoneCounted', 'false') = 'true') AS unmarked`,
            [stored],
          )
        ).rows[0].unmarked

      expect(await marked(null)).toBe(true)
      expect(await marked('{"phoneCounted": false}')).toBe(true)
      expect(await marked('{"phoneCounted": true}')).toBe(false)
    })
  })

  describe("the comment search escape", () => {
    test.each([
      ["50%", "sale 50% off", true],
      ["50%", "sale 500 off", false],
      ["a_b", "a_b", true],
      ["a_b", "axb", false],
      ["back\\slash", "a back\\slash b", true],
      ["HELLO", "say hello", true],
    ])("%j in %j is %s", async (search, text, expected) => {
      const escaped = search.replace(/[\\%_]/g, "\\$&")
      const result = await client.query<{ matches: boolean }>(
        `SELECT $1::text ILIKE $2::text ESCAPE '\\' AS matches`,
        [text, `%${escaped}%`],
      )

      expect(result.rows[0].matches).toBe(expected)
    })
  })
})
