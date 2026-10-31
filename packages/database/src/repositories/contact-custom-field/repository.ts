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

export const contactCustomFieldRepository = {
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
