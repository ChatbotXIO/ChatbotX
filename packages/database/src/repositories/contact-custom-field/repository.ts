import { and, asc, db, eq, inArray, sql } from "../../client"
import { contactCustomFieldModel, contactModel } from "../../schema"

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
