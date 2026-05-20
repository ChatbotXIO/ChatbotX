import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  type ContactImportMeta,
  type CustomFieldType,
  contactImportMetaSchema,
  contactSources,
} from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  conversationModel,
  type inboxModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../../../lib/logger"
import type {
  BatchResult,
  ImportPrepareResult,
  ImportRow,
  ImportTypeHandler,
} from "../../base-import"
import { validateCustomFieldValue } from "../../validations/custom-field-value"
import { type ContactRow, extractRowData } from "./extractor"

type ContactDeps = {
  customFieldTypes: Map<string, CustomFieldType>
  inbox: typeof inboxModel.$inferSelect
}

type AcceptedContact = {
  contactId: string
  row: ContactRow
}

const prepareContacts = async ({
  row,
  meta,
}: {
  row: ImportRow
  meta: ContactImportMeta
}): Promise<ImportPrepareResult<ContactDeps>> => {
  const inbox = await db.query.inboxModel.findFirst({
    where: { id: row.inboxId, workspaceId: row.workspaceId },
  })

  if (!inbox) {
    return { ok: false, reason: "Inbox not found" }
  }

  if (meta.tagId) {
    const tag = await db.query.tagModel.findFirst({
      where: { id: meta.tagId, workspaceId: row.workspaceId },
      columns: { id: true },
    })

    if (!tag) {
      return { ok: false, reason: "Tag not found in workspace" }
    }
  }

  const customFieldTypes = new Map<string, CustomFieldType>()
  if (meta.fieldMapping?.length) {
    const ids = meta.fieldMapping.map((m) => m.customFieldId)

    const fields = await db.query.customFieldModel.findMany({
      where: { id: { in: ids }, workspaceId: row.workspaceId },
      columns: { id: true, type: true },
    })

    for (const field of fields) {
      customFieldTypes.set(field.id, field.type)
    }
  }

  return { ok: true, deps: { customFieldTypes, inbox } }
}

const processContactRow = (
  deps: ContactDeps,
  rawRow: Record<string, unknown>,
  meta: ContactImportMeta,
): ContactRow | null => {
  const mapped = extractRowData(rawRow, meta.columnMap, meta.fieldMapping, {
    countryCode: meta.countryCode,
    channel: meta.channel,
  })
  if (!mapped) {
    return null
  }

  const safeCustomFields = mapped.customFields.flatMap((field) => {
    const type = deps.customFieldTypes.get(field.customFieldId)
    if (!type) {
      return []
    }

    const normalized = validateCustomFieldValue(type, field.value)
    if (normalized === null) {
      return []
    }

    return [{ customFieldId: field.customFieldId, value: normalized }]
  })

  return { ...mapped, customFields: safeCustomFields }
}

const insertContactBatch = async (
  deps: ContactDeps,
  accepted: AcceptedContact[],
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.insert(contactModel).values(
      accepted.map(({ contactId, row }) => ({
        id: contactId,
        workspaceId: ctx.row.workspaceId,
        phoneNumber: row.phoneNumber,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
      })),
    )

    await tx.insert(contactInboxModel).values(
      accepted.map(({ contactId, row }) => ({
        id: createId(),
        originalContactId: contactId,
        contactId,
        inboxId: ctx.row.inboxId,
        channel: deps.inbox.channel,
        source: contactSources.enum.imported as string,
        sourceId: row.externalId as string,
      })),
    )

    await tx.insert(conversationModel).values(
      accepted.map(({ contactId }) => ({
        id: createId(),
        workspaceId: ctx.row.workspaceId,
        contactId,
      })),
    )

    const customFieldValues = accepted.flatMap(({ contactId, row }) =>
      row.customFields.map((field) => ({
        id: createId(),
        contactId,
        customFieldId: field.customFieldId,
        value: field.value,
      })),
    )
    if (customFieldValues.length) {
      await tx.insert(contactCustomFieldModel).values(customFieldValues)
    }

    if (ctx.meta.tagId) {
      const tagId = ctx.meta.tagId
      await tx
        .insert(contactsToTagsModel)
        .values(accepted.map(({ contactId }) => ({ contactId, tagId })))
        .onConflictDoNothing()
    }

    await tx
      .update(workspaceUsageModel)
      .set({
        contactsCount: sql`${workspaceUsageModel.contactsCount} + ${accepted.length}`,
      })
      .where(eq(workspaceUsageModel.workspaceId, ctx.row.workspaceId))
  })
}

const processContactBatch = async (
  deps: ContactDeps,
  rows: ContactRow[],
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<BatchResult> => {
  const total = rows.length
  try {
    // Drop rows without an externalId and de-duplicate within the chunk so a
    // single file can't insert the same contact twice.
    const contactIds = new Set<string>()
    const contacts: ContactRow[] = []
    for (const row of rows) {
      const externalId = row.externalId
      if (!externalId || contactIds.has(externalId)) {
        continue
      }
      contactIds.add(externalId)
      contacts.push(row)
    }
    if (contacts.length === 0) {
      return { success: 0, failed: total }
    }

    const externalIds = contacts.map((c) => c.externalId as string)
    const existingRows = await db.query.contactInboxModel.findMany({
      where: { inboxId: ctx.row.inboxId, sourceId: { in: externalIds } },
      columns: { sourceId: true },
    })

    const existing = new Set(existingRows.map((e) => e.sourceId))

    const usage = await db.query.workspaceUsageModel.findFirst({
      where: { workspaceId: ctx.row.workspaceId },
    })

    if (!usage) {
      return { success: 0, failed: total }
    }

    let remaining = usage.maxContacts - usage.contactsCount

    const accepted: AcceptedContact[] = []
    for (const row of contacts) {
      if (existing.has(row.externalId as string) || remaining <= 0) {
        continue
      }
      remaining -= 1
      accepted.push({ contactId: createId(), row })
    }
    if (accepted.length === 0) {
      return { success: 0, failed: total }
    }

    await insertContactBatch(deps, accepted, ctx)

    return { success: accepted.length, failed: total - accepted.length }
  } catch (error) {
    logger.error(error, "Import batch failed")
    return { success: 0, failed: total }
  }
}

export const contactsImportHandler: ImportTypeHandler<
  ContactImportMeta,
  ContactDeps,
  ContactRow
> = {
  type: "contacts",
  parseMeta: (raw) => contactImportMetaSchema.parse(raw),
  prepare: prepareContacts,
  processRow: processContactRow,
  processBatch: processContactBatch,
}
