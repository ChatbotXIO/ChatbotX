import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  or,
  sql,
} from "../../client"
import {
  contactCustomFieldModel,
  contactModel,
  customFieldModel,
} from "../../schema"
import { contactRepository } from "../contact/repository"

export const contactCustomFieldRepository = {
  /**
   * Serializes read-modify-write operations on `(contact, field)` pairs, also
   * when the row does not exist yet (a row lock cannot guard a missing row).
   * Locks are taken in a global id order, so concurrent single, bulk and
   * multi-field calls cannot deadlock each other. Released at commit.
   */
  async lockPairs(
    tx: DatabaseClient,
    pairs: ReadonlyArray<{ contactId: string; customFieldId: string }>,
  ): Promise<void> {
    const keys = [
      ...new Set(
        pairs.map(
          ({ contactId, customFieldId }) => `${contactId}:${customFieldId}`,
        ),
      ),
    ].sort()
    for (const key of keys) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`ccf:${key}`}, 0))`,
      )
    }
  },

  /**
   * One query for every requested pair; callers match pairs in memory. Reads
   * `FOR UPDATE` so a concurrent plain `set` (which takes no pair lock) waits
   * for the row instead of being overwritten from a stale read.
   */
  async listValuesForPairs(
    input: { contactIds: string[]; customFieldIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<
    Array<{ contactId: string; customFieldId: string; value: string }>
  > {
    if (input.contactIds.length === 0 || input.customFieldIds.length === 0) {
      return []
    }
    return await tx
      .select({
        contactId: contactCustomFieldModel.contactId,
        customFieldId: contactCustomFieldModel.customFieldId,
        value: contactCustomFieldModel.value,
      })
      .from(contactCustomFieldModel)
      .where(
        and(
          inArray(contactCustomFieldModel.contactId, input.contactIds),
          inArray(contactCustomFieldModel.customFieldId, input.customFieldIds),
        ),
      )
      .for("update")
  },

  /** Deletes one value and returns what it held, or null if there was none. */
  async deleteValue(
    input: { contactId: string; customFieldId: string },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [deleted] = await tx
      .delete(contactCustomFieldModel)
      .where(
        and(
          eq(contactCustomFieldModel.contactId, input.contactId),
          eq(contactCustomFieldModel.customFieldId, input.customFieldId),
        ),
      )
      .returning({ value: contactCustomFieldModel.value })
    return deleted?.value ?? null
  },

  /**
   * Reads selected contact values through both ownership boundaries. The
   * `ContactCustomField` table cannot be trusted on its own because legacy
   * rows can theoretically join a Contact and CustomField from other spaces.
   */
  async listSelectedDefinitionValuesByContact(
    input: { contactId: string; customFieldIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<
    Array<{ id: string; name: string; type: string; value: unknown }>
  > {
    if (input.customFieldIds.length === 0) {
      return []
    }
    return await tx
      .select({
        id: customFieldModel.id,
        name: customFieldModel.name,
        type: customFieldModel.type,
        value: contactCustomFieldModel.value,
      })
      .from(contactCustomFieldModel)
      .innerJoin(
        customFieldModel,
        eq(contactCustomFieldModel.customFieldId, customFieldModel.id),
      )
      .innerJoin(
        contactModel,
        eq(contactCustomFieldModel.contactId, contactModel.id),
      )
      .where(
        and(
          eq(contactCustomFieldModel.contactId, input.contactId),
          eq(contactModel.workspaceId, input.workspaceId),
          eq(customFieldModel.workspaceId, input.workspaceId),
          inArray(contactCustomFieldModel.customFieldId, input.customFieldIds),
        ),
      )
  },
  /**
   * A contact's values for the fields matching any of `ids` or `names`,
   * newest write first. Scoped through both ownership boundaries.
   */
  async listValuesByFieldKeys(
    input: {
      workspaceId: string
      contactId: string
      ids: string[]
      names: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<
    Array<{
      customFieldId: string
      name: string
      value: string
      updatedAt: Date
    }>
  > {
    if (input.ids.length === 0 && input.names.length === 0) {
      return []
    }
    return await tx
      .select({
        customFieldId: customFieldModel.id,
        name: customFieldModel.name,
        value: contactCustomFieldModel.value,
        updatedAt: contactCustomFieldModel.updatedAt,
      })
      .from(contactCustomFieldModel)
      .innerJoin(
        customFieldModel,
        eq(contactCustomFieldModel.customFieldId, customFieldModel.id),
      )
      .innerJoin(
        contactModel,
        eq(contactCustomFieldModel.contactId, contactModel.id),
      )
      .where(
        and(
          eq(contactCustomFieldModel.contactId, input.contactId),
          eq(contactModel.workspaceId, input.workspaceId),
          eq(customFieldModel.workspaceId, input.workspaceId),
          or(
            input.ids.length > 0
              ? inArray(customFieldModel.id, input.ids)
              : undefined,
            input.names.length > 0
              ? inArray(customFieldModel.name, input.names)
              : undefined,
          ),
        ),
      )
      .orderBy(
        desc(contactCustomFieldModel.updatedAt),
        desc(contactCustomFieldModel.id),
      )
  },
  listWithDefinitionByContact(
    input: { contactId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactCustomFieldModel.findMany({
      where: {
        contactId: input.contactId,
        customField: { workspaceId: input.workspaceId },
      },
      with: { customField: true },
    })
  },
  findWithDefinition(
    input: { contactId: string; customFieldId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactCustomFieldModel.findFirst({
      where: {
        contactId: input.contactId,
        customFieldId: input.customFieldId,
        customField: { workspaceId: input.workspaceId },
      },
      with: { customField: true },
    })
  },

  /**
   * Writes already-normalized values: `fill` keeps an existing value,
   * `overwrite` replaces it. One value per `(contact, field)` is written —
   * the first given — since one statement cannot update a row twice; the
   * others count as dropped. Rows are sorted so concurrent batches lock the
   * unique index in the same order, and inserted in chunks that stay far
   * below Postgres' bind-parameter limit. Emits nothing.
   */
  async bulkUpsertValues(
    input: {
      workspaceId: string
      mode: "fill" | "overwrite"
      entries: { contactId: string; customFieldId: string; value: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<{ dropped: number }> {
    if (input.entries.length === 0) {
      return { dropped: 0 }
    }
    return await tx.transaction(async (trx) => {
      // Contacts first, then fields (same order as `linkTags`), each
      // key-share locked until the write commits: a contact or field deleted
      // meanwhile cannot fail the insert's foreign key. Values of a deleted
      // field are dropped and reported; values of a deleted contact are
      // dropped silently, as there is no contact left to report them on.
      const liveContacts = await contactRepository.lockLiveIds(
        {
          workspaceId: input.workspaceId,
          ids: input.entries.map((entry) => entry.contactId),
        },
        trx,
      )
      const entries = input.entries.filter((entry) =>
        liveContacts.has(entry.contactId),
      )
      if (entries.length === 0) {
        return { dropped: 0 }
      }
      const live = await trx
        .select({ id: customFieldModel.id })
        .from(customFieldModel)
        .where(
          and(
            eq(customFieldModel.workspaceId, input.workspaceId),
            inArray(customFieldModel.id, [
              ...new Set(entries.map((entry) => entry.customFieldId)),
            ]),
          ),
        )
        .orderBy(customFieldModel.id)
        .for("key share")
      const liveIds = new Set(live.map((row) => row.id))
      const firstByPair = new Map<string, (typeof entries)[number]>()
      for (const entry of entries) {
        const pair = `${entry.contactId}:${entry.customFieldId}`
        if (liveIds.has(entry.customFieldId) && !firstByPair.has(pair)) {
          firstByPair.set(pair, entry)
        }
      }
      const values = [...firstByPair.values()].sort(
        (a, b) =>
          a.contactId.localeCompare(b.contactId) ||
          a.customFieldId.localeCompare(b.customFieldId),
      )
      for (
        let offset = 0;
        offset < values.length;
        offset += VALUE_UPSERT_CHUNK_SIZE
      ) {
        await upsertValueRows(
          trx,
          input.mode,
          values.slice(offset, offset + VALUE_UPSERT_CHUNK_SIZE),
        )
      }
      return { dropped: entries.length - values.length }
    })
  },
}

/** Rows per insert: a few bind parameters each, far below Postgres' 65,535. */
const VALUE_UPSERT_CHUNK_SIZE = 1000

const upsertValueRows = async (
  tx: DatabaseClient,
  mode: "fill" | "overwrite",
  rows: { contactId: string; customFieldId: string; value: string }[],
): Promise<void> => {
  const insert = tx.insert(contactCustomFieldModel).values(rows)
  const target = [
    contactCustomFieldModel.contactId,
    contactCustomFieldModel.customFieldId,
  ]
  if (mode === "fill") {
    await insert.onConflictDoNothing({ target })
    return
  }
  await insert.onConflictDoUpdate({
    target,
    set: { value: sql`excluded."value"`, updatedAt: new Date() },
    setWhere: sql`${contactCustomFieldModel.value} IS DISTINCT FROM excluded."value"`,
  })
}

export type DateTimeSweepCursor = {
  customFieldId: string
  id: string
}

export type DateTimeContactCustomFieldRow = {
  contact: { id: string; workspaceId: string }
  contactId: string
  customFieldId: string
  value: unknown
}

export async function listContactCustomFieldsForDateTimeSweep(params: {
  customFieldIds: string[]
  cursor?: DateTimeSweepCursor
  limit: number
}): Promise<{
  nextCursor: DateTimeSweepCursor | undefined
  rows: DateTimeContactCustomFieldRow[]
}> {
  if (params.customFieldIds.length === 0) {
    return { rows: [], nextCursor: undefined }
  }

  const cursorPredicate = params.cursor
    ? sql`(${contactCustomFieldModel.customFieldId}, ${contactCustomFieldModel.id}) > (${params.cursor.customFieldId}, ${params.cursor.id})`
    : undefined

  const rows = await db
    .select({
      contactId: contactCustomFieldModel.contactId,
      contactWorkspaceId: contactModel.workspaceId,
      customFieldId: contactCustomFieldModel.customFieldId,
      id: contactCustomFieldModel.id,
      value: contactCustomFieldModel.value,
    })
    .from(contactCustomFieldModel)
    .innerJoin(
      contactModel,
      eq(contactCustomFieldModel.contactId, contactModel.id),
    )
    .where(
      and(
        inArray(contactCustomFieldModel.customFieldId, params.customFieldIds),
        cursorPredicate,
      ),
    )
    // Cursor pages are grouped by customFieldId. Datetime sweep conditions read
    // one field at a time, so contacts may safely span pages.
    .orderBy(
      asc(contactCustomFieldModel.customFieldId),
      asc(contactCustomFieldModel.id),
    )
    .limit(params.limit)

  const lastRow = rows.at(-1)

  return {
    rows: rows.map((row) => ({
      contact: {
        id: row.contactId,
        workspaceId: row.contactWorkspaceId,
      },
      contactId: row.contactId,
      customFieldId: row.customFieldId,
      value: row.value,
    })),
    nextCursor:
      rows.length === params.limit && lastRow
        ? {
            customFieldId: lastRow.customFieldId,
            id: lastRow.id,
          }
        : undefined,
  }
}

export async function listContactCustomFieldsForDateTimeSweepContacts(params: {
  contactIds: string[]
  customFieldIds: string[]
}): Promise<DateTimeContactCustomFieldRow[]> {
  if (params.contactIds.length === 0 || params.customFieldIds.length === 0) {
    return []
  }

  const rows = await db
    .select({
      contactId: contactCustomFieldModel.contactId,
      contactWorkspaceId: contactModel.workspaceId,
      customFieldId: contactCustomFieldModel.customFieldId,
      value: contactCustomFieldModel.value,
    })
    .from(contactCustomFieldModel)
    .innerJoin(
      contactModel,
      eq(contactCustomFieldModel.contactId, contactModel.id),
    )
    .where(
      and(
        inArray(contactCustomFieldModel.contactId, params.contactIds),
        inArray(contactCustomFieldModel.customFieldId, params.customFieldIds),
      ),
    )
    .orderBy(
      asc(contactCustomFieldModel.contactId),
      asc(contactCustomFieldModel.customFieldId),
    )

  return rows.map((row) => ({
    contact: {
      id: row.contactId,
      workspaceId: row.contactWorkspaceId,
    },
    contactId: row.contactId,
    customFieldId: row.customFieldId,
    value: row.value,
  }))
}
