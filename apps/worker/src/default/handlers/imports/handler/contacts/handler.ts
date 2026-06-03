import { userQuotaService, workspaceService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
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
} from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
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
  ownerId: string
}

type AcceptedContact = {
  contactId: string
  row: ContactRow
}

// H-4: Parallelize all independent DB lookups to cut ~3 round-trips.
const prepareContacts = async ({
  row,
  meta,
}: {
  row: ImportRow
  meta: ContactImportMeta
}): Promise<ImportPrepareResult<ContactDeps>> => {
  const customFieldIds = meta.fieldMapping?.length
    ? meta.fieldMapping.map((m) => m.customFieldId)
    : []

  const [inbox, workspace, tag, fields] = await Promise.all([
    db.query.inboxModel.findFirst({
      where: { id: row.inboxId, workspaceId: row.workspaceId },
    }),
    workspaceService.find({ where: { id: row.workspaceId } }),
    meta.tagId
      ? db.query.tagModel.findFirst({
          where: { id: meta.tagId, workspaceId: row.workspaceId },
          columns: { id: true },
        })
      : null,
    customFieldIds.length
      ? db.query.customFieldModel.findMany({
          where: { id: { in: customFieldIds }, workspaceId: row.workspaceId },
          columns: { id: true, type: true },
        })
      : [],
  ])

  if (!inbox) {
    return { ok: false, reason: "Inbox not found" }
  }
  if (!workspace) {
    return { ok: false, reason: "Workspace not found" }
  }
  if (meta.tagId && !tag) {
    return { ok: false, reason: "Tag not found in workspace" }
  }

  const customFieldTypes = new Map<string, CustomFieldType>()
  for (const field of fields) {
    customFieldTypes.set(field.id, field.type)
  }

  return {
    ok: true,
    deps: { customFieldTypes, inbox, ownerId: workspace.ownerId },
  }
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

// C-1: Serialize quota check + insert + increment per owner via a distributed
// lock so concurrent import jobs cannot both pass the remaining-slots gate and
// together exceed the plan limit.
const insertContactBatch = (
  deps: ContactDeps,
  eligible: ContactRow[],
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<number> => {
  return distributedLock.runExclusive({
    key: `contact-import-quota:${deps.ownerId}`,
    timeoutInSeconds: 30,
    fn: async () => {
      const remaining = await userQuotaService.getRemainingSlots(
        deps.ownerId,
        "contacts",
      )
      if (remaining === 0) {
        return 0
      }

      const toInsert =
        remaining === null ? eligible : eligible.slice(0, remaining)
      const accepted: AcceptedContact[] = toInsert.map((row) => ({
        contactId: createId(),
        row,
      }))
      if (accepted.length === 0) {
        return 0
      }

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

        // H-2: Use onConflictDoNothing so a contact appearing in two separate
        // 1 000-row batches does not roll back the entire second batch.
        await tx
          .insert(contactInboxModel)
          .values(
            accepted.map(({ contactId, row }) => {
              // C-2: externalId is guaranteed non-null here by processContactBatch,
              // but assert explicitly rather than casting to catch future regressions.
              if (!row.externalId) {
                throw new Error(
                  "Invariant: externalId must be set before insert",
                )
              }
              return {
                id: createId(),
                originalContactId: contactId,
                contactId,
                inboxId: ctx.row.inboxId,
                channel: deps.inbox.channel,
                source: contactSources.enum.imported,
                sourceId: row.externalId,
              }
            }),
          )
          .onConflictDoNothing()

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
      })

      // H-1: Increment inside the lock so the live Redis counter is updated
      // before another concurrent import reads it.
      await userQuotaService.incrementBy(
        deps.ownerId,
        "contacts",
        accepted.length,
      )

      return accepted.length
    },
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

    const eligible = contacts.filter(
      (row) => !existing.has(row.externalId as string),
    )
    if (eligible.length === 0) {
      return { success: 0, failed: total }
    }

    const inserted = await insertContactBatch(deps, eligible, ctx)

    return { success: inserted, failed: total - inserted }
  } catch (error) {
    // H-5: use `err` key so pino serializes the full stack trace.
    logger.error({ err: error }, "Import batch failed")
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
