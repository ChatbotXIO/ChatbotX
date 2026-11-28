import type { AnyPgColumn } from "drizzle-orm/pg-core"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  exists,
  ilike,
  isNull,
  lte,
  sql,
} from "../../client"
import { contactsToTagsModel, tagModel } from "../../schema"
import { likeContains } from "../../utils"

/** One tag shown on a conversation row. */
export type ContactTagPreviewItem = {
  id: string
  name: string
  /** `#RRGGBB`, or null when the tag has no color. */
  color: string | null
}

/** The first few tags of one contact, plus how many it has in total. */
export type ContactTagPreview = {
  tagCount: number
  tagPreview: ContactTagPreviewItem[]
}

/** Contacts read per pair of statements: a longer id list is read in slices of this size. */
const TAG_PREVIEW_CONTACT_CHUNK_SIZE = 500

/** A tag as the composer grid lists it: no contact count. */
export type TagOption = {
  id: string
  name: string
  color: string | null
}

/** One page of `tagRepository.listOptions`. */
export type TagOptionPage = {
  /** `applied` is present only when the page was read for a contact. */
  data: (TagOption & { applied?: boolean })[]
  pageCount: number
}

/** One bigint-array parameter: the statement stays one bind however many ids there are. */
const anyOf = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = ANY(${sql.param(ids)}::bigint[])`

export const tagRepository = {
  /**
   * Live tags of a workspace by name then id, one page at a time, optionally
   * filtered by a name substring. Unlike the management list it counts no
   * contacts per tag: id, name and color only.
   *
   * With `contactId` each row also carries `applied`: whether that contact has
   * the tag. It is an EXISTS on the page's tags only, probing `ContactToTag`
   * by its primary key `(contactId, tagId)`. Postgres may plan that EXISTS as
   * a hashed SubPlan, which reads the contact's links once, so the cost can
   * grow with the contact's own tag count but never with the workspace's. The
   * caller checks the contact is reachable; a foreign contact id just yields
   * `applied: false` rows. Without `contactId` the rows have no `applied` key.
   */
  async listOptions(
    input: {
      workspaceId: string
      name?: string | null
      page: number
      perPage: number
      contactId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<TagOptionPage> {
    const where = and(
      eq(tagModel.workspaceId, input.workspaceId),
      isNull(tagModel.deletedAt),
      input.name ? ilike(tagModel.name, likeContains(input.name)) : undefined,
    )
    const { contactId } = input
    const optionColumns = {
      id: tagModel.id,
      name: tagModel.name,
      color: tagModel.color,
    }
    const offset = (input.page - 1) * input.perPage
    const [data, totalRows] = await Promise.all([
      contactId
        ? tx
            .select({
              ...optionColumns,
              applied: exists(
                tx
                  .select({ one: sql`1` })
                  .from(contactsToTagsModel)
                  .where(
                    and(
                      eq(contactsToTagsModel.contactId, contactId),
                      eq(contactsToTagsModel.tagId, tagModel.id),
                    ),
                  ),
              ).mapWith(Boolean),
            })
            .from(tagModel)
            .where(where)
            .orderBy(asc(tagModel.name), asc(tagModel.id))
            .limit(input.perPage)
            .offset(offset)
        : tx
            .select(optionColumns)
            .from(tagModel)
            .where(where)
            .orderBy(asc(tagModel.name), asc(tagModel.id))
            .limit(input.perPage)
            .offset(offset),
      tx.$count(tagModel, where),
    ])
    return { data, pageCount: Math.ceil(totalRows / input.perPage) }
  },

  /**
   * Which of `tagIds` the contact has: a probe of `ContactToTag` by its
   * primary key `(contactId, tagId)` joined to the live tags of the workspace,
   * so deleted tags and ids of other workspaces are never reported. One
   * `= ANY` bind however many ids (the request caps them); an empty list is
   * answered without a query. The caller checks the contact is
   * reachable.
   */
  async listAppliedTagIds(
    input: { contactId: string; tagIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const tagIds = [...new Set(input.tagIds)]
    if (tagIds.length === 0) {
      return []
    }
    const rows = await tx
      .select({ tagId: contactsToTagsModel.tagId })
      .from(contactsToTagsModel)
      .innerJoin(tagModel, eq(tagModel.id, contactsToTagsModel.tagId))
      .where(
        and(
          eq(contactsToTagsModel.contactId, input.contactId),
          anyOf(contactsToTagsModel.tagId, tagIds),
          eq(tagModel.workspaceId, input.workspaceId),
          isNull(tagModel.deletedAt),
        ),
      )
    return rows.map((row) => row.tagId)
  },

  /**
   * The first `limit` tags (by name, then id) of each contact, and each
   * contact's total tag count, in two statements per slice of
   * `TAG_PREVIEW_CONTACT_CHUNK_SIZE` contacts (a page is normally one slice).
   * Soft-deleted tags and tags of other workspaces are excluded. Every
   * requested contact is present in the result (zero tags gives an empty
   * preview and a count of 0), so callers never branch on a missing key.
   */
  async listTagPreviewsByContactIds(
    input: { contactIds: string[]; limit: number; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<Map<string, ContactTagPreview>> {
    const contactIds = [...new Set(input.contactIds)]
    const result = new Map<string, ContactTagPreview>(
      contactIds.map((contactId) => [
        contactId,
        { tagCount: 0, tagPreview: [] },
      ]),
    )
    for (
      let offset = 0;
      offset < contactIds.length;
      offset += TAG_PREVIEW_CONTACT_CHUNK_SIZE
    ) {
      const slice = await readTagPreviewSlice(
        {
          contactIds: contactIds.slice(
            offset,
            offset + TAG_PREVIEW_CONTACT_CHUNK_SIZE,
          ),
          limit: input.limit,
          workspaceId: input.workspaceId,
        },
        tx,
      )
      for (const [contactId, preview] of slice) {
        result.set(contactId, preview)
      }
    }
    return result
  },
}

/** Two statements for at most `TAG_PREVIEW_CONTACT_CHUNK_SIZE` contacts. */
async function readTagPreviewSlice(
  input: { contactIds: string[]; limit: number; workspaceId: string },
  tx: DatabaseClient,
): Promise<Map<string, ContactTagPreview>> {
  const { contactIds } = input
  // Only contacts with a live tag appear here; the caller fills in the rest.
  const slice = new Map<string, ContactTagPreview>()
  const liveTagOfContacts = and(
    anyOf(contactsToTagsModel.contactId, contactIds),
    eq(tagModel.workspaceId, input.workspaceId),
    isNull(tagModel.deletedAt),
  )

  const ranked = tx
    .select({
      contactId: contactsToTagsModel.contactId,
      id: tagModel.id,
      name: tagModel.name,
      color: tagModel.color,
      position:
        sql<number>`row_number() OVER (PARTITION BY ${contactsToTagsModel.contactId} ORDER BY ${tagModel.name}, ${tagModel.id})`.as(
          "position",
        ),
    })
    .from(contactsToTagsModel)
    .innerJoin(tagModel, eq(tagModel.id, contactsToTagsModel.tagId))
    .where(liveTagOfContacts)
    .as("ranked")

  const [previewRows, countRows] = await Promise.all([
    tx
      .select({
        contactId: ranked.contactId,
        id: ranked.id,
        name: ranked.name,
        color: ranked.color,
      })
      .from(ranked)
      .where(lte(ranked.position, input.limit))
      .orderBy(ranked.contactId, ranked.position),
    tx
      .select({
        contactId: contactsToTagsModel.contactId,
        tagCount: sql<number>`count(*)::int`,
      })
      .from(contactsToTagsModel)
      .innerJoin(tagModel, eq(tagModel.id, contactsToTagsModel.tagId))
      .where(liveTagOfContacts)
      .groupBy(contactsToTagsModel.contactId),
  ])

  for (const row of countRows) {
    slice.set(row.contactId, { tagCount: row.tagCount, tagPreview: [] })
  }
  for (const row of previewRows) {
    slice.get(row.contactId)?.tagPreview.push({
      id: row.id,
      name: row.name,
      color: row.color,
    })
  }
  return slice
}
