// @vitest-environment node

/**
 * `tagRepository.listTagPreviewsByContactIds` against a real database: the
 * first tags by name, the exact total, soft-deleted tags and other workspaces'
 * tags left out, and a constant two statements however many contacts a page
 * holds.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { tagRepository } from "../../src/repositories/tag/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const CONTACT_PROBE_PATTERN = /"ContactToTag"\."contactId" = \$\d+/
const TAG_PROBE_PATTERN = /"ContactToTag"\."tagId" = "Tag"\."id"/

const databaseUrl = realDatabaseUrl()

type Fixture = {
  contactIds: string[]
  otherWorkspaceId: string
  userId: string
  workspaceId: string
}

describe.skipIf(!databaseUrl)("tag previews by contact", () => {
  let client: Client
  let fixture: Fixture
  let statements: string[]

  const database = () =>
    drizzle({
      client,
      relations,
      schema,
      logger: {
        logQuery: (query: string) => {
          statements.push(query)
        },
      },
    })

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    statements = []
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `tag-previews-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace, otherWorkspace] = await db
      .insert(schema.workspaceModel)
      .values([
        { name: `tag-previews-${suffix}`, ownerId: user.id },
        { name: `tag-previews-other-${suffix}`, ownerId: user.id },
      ])
      .returning({ id: schema.workspaceModel.id })
    const contacts = await db
      .insert(schema.contactModel)
      .values([
        { workspaceId: workspace.id },
        { workspaceId: workspace.id },
        { workspaceId: workspace.id },
      ])
      .returning({ id: schema.contactModel.id })
    fixture = {
      contactIds: contacts.map((contact) => contact.id),
      otherWorkspaceId: otherWorkspace.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  })

  afterEach(async () => {
    const db = database()
    for (const workspaceId of [fixture.workspaceId, fixture.otherWorkspaceId]) {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
    }
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, fixture.userId))
  })

  const createTags = async (workspaceId: string, names: string[]) =>
    await database()
      .insert(schema.tagModel)
      .values(names.map((name) => ({ name, workspaceId })))
      .returning({ id: schema.tagModel.id, name: schema.tagModel.name })

  const link = async (contactId: string, tagIds: string[]) => {
    await database()
      .insert(schema.contactsToTagsModel)
      .values(tagIds.map((tagId) => ({ contactId, tagId })))
  }

  const list = (limit: number, contactIds = fixture.contactIds) =>
    tagRepository.listTagPreviewsByContactIds(
      { contactIds, limit, workspaceId: fixture.workspaceId },
      database() as unknown as DatabaseClient,
    )

  test("returns the first tags by name and the exact total", async () => {
    const [first, second, third] = fixture.contactIds
    const tags = await createTags(fixture.workspaceId, [
      "delta",
      "alpha",
      "charlie",
      "bravo",
    ])
    await link(
      first,
      tags.map((tag) => tag.id),
    )
    await link(second, [tags[1].id])

    const previews = await list(3)

    expect(previews.get(first)?.tagCount).toBe(4)
    expect(previews.get(first)?.tagPreview.map((tag) => tag.name)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ])
    expect(previews.get(second)).toEqual({
      tagCount: 1,
      tagPreview: [{ id: tags[1].id, name: "alpha", color: null }],
    })
    // A contact with no tags is present, with an empty preview.
    expect(previews.get(third)).toEqual({ tagCount: 0, tagPreview: [] })
  })

  test("carries each tag's color (null when it has none)", async () => {
    const [contactId] = fixture.contactIds
    const [colored, plain] = await database()
      .insert(schema.tagModel)
      .values([
        {
          name: "a-colored",
          workspaceId: fixture.workspaceId,
          color: "#1A2B3C",
        },
        { name: "b-plain", workspaceId: fixture.workspaceId },
      ])
      .returning({ id: schema.tagModel.id })
    await link(contactId, [colored.id, plain.id])

    const preview = (await list(3)).get(contactId)

    expect(preview?.tagPreview).toEqual([
      { id: colored.id, name: "a-colored", color: "#1A2B3C" },
      { id: plain.id, name: "b-plain", color: null },
    ])
  })

  test("leaves soft-deleted tags out of the preview and the count", async () => {
    const [contactId] = fixture.contactIds
    const tags = await createTags(fixture.workspaceId, ["a", "b", "c"])
    await link(
      contactId,
      tags.map((tag) => tag.id),
    )
    await database()
      .update(schema.tagModel)
      .set({ deletedAt: new Date() })
      .where(eq(schema.tagModel.id, tags[0].id))

    const preview = (await list(3)).get(contactId)

    expect(preview?.tagCount).toBe(2)
    expect(preview?.tagPreview.map((tag) => tag.name)).toEqual(["b", "c"])
  })

  test("ignores tags of another workspace", async () => {
    const [contactId] = fixture.contactIds
    const [own] = await createTags(fixture.workspaceId, ["own"])
    const [foreign] = await createTags(fixture.otherWorkspaceId, ["foreign"])
    await link(contactId, [own.id, foreign.id])

    const preview = (await list(3)).get(contactId)

    expect(preview?.tagCount).toBe(1)
    expect(preview?.tagPreview.map((tag) => tag.name)).toEqual(["own"])
  })

  test("a contact with 1,000 tags keeps its preview bounded and its count exact", async () => {
    const [contactId] = fixture.contactIds
    const names = Array.from(
      { length: 1000 },
      (_, index) => `tag-${String(index).padStart(4, "0")}`,
    )
    const tags = await createTags(fixture.workspaceId, names)
    await link(
      contactId,
      tags.map((tag) => tag.id),
    )

    const preview = (await list(3)).get(contactId)

    expect(preview?.tagCount).toBe(1000)
    expect(preview?.tagPreview.map((tag) => tag.name)).toEqual([
      "tag-0000",
      "tag-0001",
      "tag-0002",
    ])
  })

  test("runs a constant two statements for any number of contacts", async () => {
    const tags = await createTags(fixture.workspaceId, ["a", "b"])
    for (const contactId of fixture.contactIds) {
      await link(
        contactId,
        tags.map((tag) => tag.id),
      )
    }
    statements = []
    await list(3, fixture.contactIds.slice(0, 1))
    const forOne = statements.length
    statements = []
    await list(3, fixture.contactIds)

    expect(forOne).toBe(2)
    expect(statements).toHaveLength(2)
  })

  test("more than 500 contacts are read in slices of 500, two statements each", async () => {
    const db = database()
    const extra = await db
      .insert(schema.contactModel)
      .values(
        Array.from({ length: 1202 }, () => ({
          workspaceId: fixture.workspaceId,
        })),
      )
      .returning({ id: schema.contactModel.id })
    const [tag] = await createTags(fixture.workspaceId, ["bulk"])
    const contactIds = [...fixture.contactIds, ...extra.map((c) => c.id)]
    const tagged = [contactIds[0], contactIds[600], contactIds[1204]]
    for (const contactId of tagged) {
      await link(contactId as string, [tag.id])
    }
    statements = []

    const previews = await list(3, contactIds)

    // 1205 contacts: three slices (500 + 500 + 205), two statements each.
    expect(statements).toHaveLength(6)
    expect(previews.size).toBe(1205)
    for (const contactId of tagged) {
      expect(previews.get(contactId as string)).toEqual({
        tagCount: 1,
        tagPreview: [{ id: tag.id, name: "bulk", color: null }],
      })
    }
    expect(previews.get(contactIds[1] as string)).toEqual({
      tagCount: 0,
      tagPreview: [],
    })
  })

  test("an empty id list runs no statement", async () => {
    statements = []

    expect((await list(3, [])).size).toBe(0)
    expect(statements).toHaveLength(0)
  })

  describe("listOptions", () => {
    const options = (
      input: {
        name?: string | null
        page?: number
        perPage?: number
        contactId?: string
      } = {},
    ) =>
      tagRepository.listOptions(
        {
          page: 1,
          perPage: 50,
          workspaceId: fixture.workspaceId,
          ...input,
        },
        database() as unknown as DatabaseClient,
      )

    test("lists id, name and color by name, live tags of the workspace only", async () => {
      const [bravo, alpha, gone] = await createTags(fixture.workspaceId, [
        "bravo",
        "alpha",
        "gone",
      ])
      await createTags(fixture.otherWorkspaceId, ["other"])
      await database()
        .update(schema.tagModel)
        .set({ deletedAt: new Date() })
        .where(eq(schema.tagModel.id, (gone as { id: string }).id))

      const page = await options()

      expect(page.data).toEqual([
        { id: (alpha as { id: string }).id, name: "alpha", color: null },
        { id: (bravo as { id: string }).id, name: "bravo", color: null },
      ])
      expect(page.pageCount).toBe(1)
      expect(Object.keys(page.data[0] as object).sort()).toEqual([
        "color",
        "id",
        "name",
      ])
    })

    test("pages by offset and filters by a name substring, escaping wildcards", async () => {
      await createTags(fixture.workspaceId, ["a1", "a2", "a3", "100%", "xyz"])

      const second = await options({ page: 2, perPage: 2 })
      expect(second.data.map((tag) => tag.name)).toEqual(["a2", "a3"])
      expect(second.pageCount).toBe(3)

      expect(
        (await options({ name: "A" })).data.map((tag) => tag.name),
      ).toEqual(["a1", "a2", "a3"])
      expect(
        (await options({ name: "%" })).data.map((tag) => tag.name),
      ).toEqual(["100%"])
    })

    describe("with a contact (applied)", () => {
      const appliedByName = async (
        input: Parameters<typeof options>[0],
      ): Promise<Record<string, boolean | undefined>> =>
        Object.fromEntries(
          (await options(input)).data.map((tag) => [tag.name, tag.applied]),
        )

      test("marks the contact's tags on the page, on a later page too, and no one else's", async () => {
        const tags = await createTags(fixture.workspaceId, [
          "a1",
          "a2",
          "a3",
          "a4",
        ])
        const [contactId, otherContactId] = fixture.contactIds as [
          string,
          string,
        ]
        await link(contactId, [tags[0]?.id as string, tags[3]?.id as string])
        await link(otherContactId, [tags[1]?.id as string])

        expect(await appliedByName({ contactId, page: 1, perPage: 2 })).toEqual(
          { a1: true, a2: false },
        )
        expect(await appliedByName({ contactId, page: 2, perPage: 2 })).toEqual(
          { a3: false, a4: true },
        )
        expect((await options({ contactId, perPage: 2 })).pageCount).toBe(2)
      })

      test("leaves soft-deleted tags and other workspaces' tags out", async () => {
        const [kept, gone] = await createTags(fixture.workspaceId, [
          "kept",
          "gone",
        ])
        const [foreign] = await createTags(fixture.otherWorkspaceId, [
          "foreign",
        ])
        const contactId = fixture.contactIds[0] as string
        await link(contactId, [
          kept?.id as string,
          gone?.id as string,
          foreign?.id as string,
        ])
        await database()
          .update(schema.tagModel)
          .set({ deletedAt: new Date() })
          .where(eq(schema.tagModel.id, gone?.id as string))

        expect(await appliedByName({ contactId })).toEqual({ kept: true })
      })

      test("a contact with no tags gives applied false, and no contact gives no applied key", async () => {
        await createTags(fixture.workspaceId, ["solo"])

        expect(
          await appliedByName({ contactId: fixture.contactIds[2] as string }),
        ).toEqual({ solo: false })
        const plain = await options()
        expect(Object.keys(plain.data[0] as object)).not.toContain("applied")
      })

      test("is one EXISTS probe of ContactToTag by (contactId, tagId) in the page statement", async () => {
        const tags = await createTags(fixture.workspaceId, ["a1", "a2"])
        const contactId = fixture.contactIds[0] as string
        await link(contactId, [tags[0]?.id as string])
        statements = []

        await options({ contactId })

        // The page and its count: two statements, whatever the contact has.
        expect(statements).toHaveLength(2)
        const [listing] = statements
        expect(listing).toContain("exists")
        expect(listing).toMatch(CONTACT_PROBE_PATTERN)
        expect(listing).toMatch(TAG_PROBE_PATTERN)
      })
    })

    test("counts no contacts per tag", async () => {
      await createTags(fixture.workspaceId, ["solo"])
      statements = []

      await options()

      expect(
        statements.some((query) => query.includes("contacts_to_tags")),
      ).toBe(false)
    })
  })
  describe("listAppliedTagIds", () => {
    const applied = (contactId: string, tagIds: string[]) =>
      tagRepository.listAppliedTagIds(
        { contactId, tagIds, workspaceId: fixture.workspaceId },
        database() as unknown as DatabaseClient,
      )

    test("returns only the asked tags the contact has", async () => {
      const [first, second] = fixture.contactIds
      const tags = await createTags(fixture.workspaceId, ["a", "b", "c"])
      await link(first, [tags[0].id, tags[1].id])
      await link(second, [tags[2].id])

      const result = await applied(
        first,
        tags.map((tag) => tag.id),
      )

      expect(result.sort()).toEqual([tags[0].id, tags[1].id].sort())
      expect(await applied(first, [tags[1].id, tags[2].id])).toEqual([
        tags[1].id,
      ])
    })

    test("ignores soft-deleted tags and tags of another workspace", async () => {
      const [contactId] = fixture.contactIds
      const [live, deleted] = await createTags(fixture.workspaceId, [
        "live",
        "deleted",
      ])
      const [foreign] = await createTags(fixture.otherWorkspaceId, ["foreign"])
      await link(contactId, [live.id, deleted.id, foreign.id])
      await database()
        .update(schema.tagModel)
        .set({ deletedAt: new Date() })
        .where(eq(schema.tagModel.id, deleted.id))

      expect(
        await applied(contactId, [live.id, deleted.id, foreign.id]),
      ).toEqual([live.id])
    })

    test("an empty list reads nothing and a duplicate id is reported once", async () => {
      const [contactId] = fixture.contactIds
      const [tag] = await createTags(fixture.workspaceId, ["a"])
      await link(contactId, [tag.id])
      statements = []

      expect(await applied(contactId, [])).toEqual([])
      expect(statements).toHaveLength(0)
      expect(await applied(contactId, [tag.id, tag.id])).toEqual([tag.id])
    })
  })
})
