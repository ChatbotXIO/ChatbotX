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
  type tagModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import {
  type ContactRow,
  extractRowData,
} from "@chatbotx.io/imports/modules/contacts"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../../../lib/logger"
import type {
  ImportPrepareResult,
  ImportRow,
  ImportTypeHandler,
} from "../../base-import"
import { validateCustomFieldValue } from "../../validations/custom-field-value"

type ContactDeps = {
  customFieldTypes: Map<string, CustomFieldType>
  inbox: typeof inboxModel.$inferSelect
  tag: typeof tagModel.$inferSelect | null
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

  let tag: typeof tagModel.$inferSelect | null = null
  if (meta.tagId) {
    tag =
      (await db.query.tagModel.findFirst({
        where: { id: meta.tagId, workspaceId: row.workspaceId },
      })) || null

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

  return { ok: true, deps: { customFieldTypes, inbox, tag } }
}

const extractContactRow = (
  rawRow: Record<string, unknown>,
  meta: ContactImportMeta,
): ContactRow | null =>
  extractRowData(rawRow, meta.columnMap, meta.fieldMapping, {
    countryCode: meta.countryCode,
  })

const processContactRow = (
  deps: ContactDeps,
  mapped: ContactRow,
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<boolean> => {
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

  return tryCreateContact({
    mapped: { ...mapped, customFields: safeCustomFields },
    workspaceId: ctx.row.workspaceId,
    inboxId: ctx.row.inboxId,
    channel: ctx.meta.channel,
    tagId: ctx.meta.tagId,
    deps,
  })
}

type CreateContactInput = {
  mapped: ContactRow
  workspaceId: string
  inboxId: string
  channel: ContactImportMeta["channel"]
  tagId?: string
  deps: ContactDeps
}

const tryCreateContact = async (
  input: CreateContactInput,
): Promise<boolean> => {
  try {
    const externalId = input.mapped.externalId
    if (!externalId) {
      return false
    }

    const existing = await db.query.contactInboxModel.findFirst({
      where: {
        inboxId: input.inboxId,
        sourceId: externalId,
      },
      columns: {
        id: true,
      },
    })

    if (existing) {
      return false
    }

    const usage = await db.query.workspaceUsageModel.findFirst({
      where: { workspaceId: input.workspaceId },
    })
    if (!usage || usage.contactsCount >= usage.maxContacts) {
      return false
    }

    await db.transaction(async (tx) => {
      const contactId = createId()
      await tx.insert(contactModel).values({
        id: contactId,
        workspaceId: input.workspaceId,
        phoneNumber: input.mapped.phoneNumber,
        email: input.mapped.email,
        firstName: input.mapped.firstName,
        lastName: input.mapped.lastName,
      })

      await tx.insert(contactInboxModel).values({
        id: createId(),
        originalContactId: contactId,
        contactId,
        inboxId: input.inboxId,
        channel: input.deps.inbox.channel,
        source: contactSources.enum.imported as string,
        sourceId: externalId,
      })

      await tx.insert(conversationModel).values({
        id: createId(),
        workspaceId: input.workspaceId,
        contactId,
      })

      await tx
        .update(workspaceUsageModel)
        .set({
          contactsCount: sql`${workspaceUsageModel.contactsCount} + 1`,
        })
        .where(eq(workspaceUsageModel.workspaceId, input.workspaceId))

      if (input.tagId) {
        await tx
          .insert(contactsToTagsModel)
          .values({ contactId, tagId: input.tagId })
          .onConflictDoNothing()
      }

      if (input.mapped.customFields.length) {
        await tx.insert(contactCustomFieldModel).values(
          input.mapped.customFields.map((field) => ({
            id: createId(),
            contactId,
            customFieldId: field.customFieldId,
            value: field.value,
          })),
        )
      }
    })

    return true
  } catch (error) {
    logger.error(error, "Import row failed")
    return false
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
  extractRow: extractContactRow,
  processRow: processContactRow,
}
