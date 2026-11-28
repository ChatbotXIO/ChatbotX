import type { AnyPgColumn } from "drizzle-orm/pg-core"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
  lte,
  sql,
} from "../../client"
import { contactsToTagsModel, tagModel } from "../../schema"

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
export const TAG_PREVIEW_CONTACT_CHUNK_SIZE = 500

/** One bigint-array parameter: the statement stays one bind however many ids there are. */
const anyOf = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = ANY(${sql.param(ids)}::bigint[])`

export const tagRepository = {
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
  const slice = new Map<string, ContactTagPreview>(
    contactIds.map((contactId) => [contactId, { tagCount: 0, tagPreview: [] }]),
  )
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
    const entry = slice.get(row.contactId)
    if (entry) {
      entry.tagCount = row.tagCount
    }
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
