import {
  contactCustomFieldService,
  contactInboxService,
  messageCleanupService,
  quotaEnforcementService,
  workspaceService,
  workspaceUsageService,
} from "@chatbotx.io/business"
import { db, inArray } from "@chatbotx.io/database/client"
import {
  type ContactImportMeta,
  type CustomFieldType,
  contactImportMetaSchema,
  contactSources,
} from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  conversationModel,
  type inboxModel,
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
  ownerId: string
}

type AcceptedContact = {
  contactId: string
  contactInboxId: string
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
    row.inboxId
      ? db.query.inboxModel.findFirst({
          where: { id: row.inboxId, workspaceId: row.workspaceId },
        })
      : null,
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

    const normalized = validateCustomFieldValue(
      type,
      field.value,
      meta.timezone,
    )
    if (normalized === null) {
      return []
    }

    return [{ customFieldId: field.customFieldId, value: normalized }]
  })

  return { ...mapped, customFields: safeCustomFields }
}

// Import only creates contact records: the info-only `contacts` metric is
// counted (see processContactBatch), but MAC is never reserved here — MAC is
// counted later only when a real interaction occurs.
const insertContactBatch = async (
  deps: ContactDeps,
  eligible: ContactRow[],
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<number> => {
  const externalIds = eligible.map((row) => row.externalId as string)
  const latestExisting = await contactInboxService.findExistingSourceIds({
    inboxId: deps.inbox.id,
    sourceIds: externalIds,
  })

  const freshEligible = eligible.filter(
    (row) => !latestExisting.has(row.externalId as string),
  )
  if (freshEligible.length === 0) {
    return 0
  }

  const accepted: AcceptedContact[] = freshEligible.map((row) => ({
    contactId: createId(),
    contactInboxId: createId(),
    row,
  }))
  if (accepted.length === 0) {
    return 0
  }

  return db.transaction(async (tx) => {
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

    // A duplicate should already have been removed by the re-check, but a
    // non-import path (e.g. a concurrent inbound message creating the same
    // (inboxId, sourceId)) can still win the race in the window between
    // that re-check and this insert. `onConflictDoNothing` skips those rows;
    // we then continue with only the contacts whose link actually inserted,
    // so a single late conflict can no longer fail the entire batch while
    // still guaranteeing no contact is created without its inbox row.
    const insertedContactInboxes = await tx
      .insert(contactInboxModel)
      .values(
        accepted.map(({ contactId, contactInboxId, row }) => {
          // C-2: externalId is guaranteed non-null here by processContactBatch,
          // but assert explicitly rather than casting to catch future regressions.
          if (!row.externalId) {
            throw new Error("Invariant: externalId must be set before insert")
          }
          return {
            id: contactInboxId,
            originalContactId: contactId,
            contactId,
            inboxId: deps.inbox.id,
            channel: deps.inbox.channel,
            source: contactSources.enum.imported,
            sourceId: row.externalId,
          }
        }),
      )
      .onConflictDoNothing()
      .returning({ contactId: contactInboxModel.contactId })

    const insertedContactIds = new Set(
      insertedContactInboxes.map((inboxRow) => inboxRow.contactId),
    )
    const survivors = accepted.filter(({ contactId }) =>
      insertedContactIds.has(contactId),
    )

    // Re-created contacts keep their history: cancel any pending message
    // cleanup recorded when contacts with these inbox identities were deleted.
    await messageCleanupService.cancelByInboxSource({
      inboxId: deps.inbox.id,
      sourceIds: survivors.flatMap(({ row }) =>
        row.externalId ? [row.externalId] : [],
      ),
      tx,
    })

    // Prune the orphan Contact rows whose link lost the conflict so we never
    // leave a contact without a channel row (cascades clean up any partial
    // children).
    if (survivors.length !== accepted.length) {
      const orphanIds = accepted
        .filter(({ contactId }) => !insertedContactIds.has(contactId))
        .map(({ contactId }) => contactId)
      await tx.delete(contactModel).where(inArray(contactModel.id, orphanIds))
      logger.warn(
        { inboxId: deps.inbox.id, conflicts: orphanIds.length },
        "Import contact source conflict: skipped already-linked contacts",
      )
    }

    if (survivors.length === 0) {
      return 0
    }

    await tx.insert(conversationModel).values(
      survivors.map(({ contactId }) => ({
        id: createId(),
        workspaceId: ctx.row.workspaceId,
        contactId,
      })),
    )

    await contactCustomFieldService.insertNormalizedValuesForNewContacts({
      workspaceId: ctx.row.workspaceId,
      entries: survivors.map(({ contactId, row }) => ({
        contactId,
        fields: row.customFields,
      })),
      tx,
    })

    if (ctx.meta.tagId) {
      const tagId = ctx.meta.tagId
      await tx
        .insert(contactsToTagsModel)
        .values(survivors.map(({ contactId }) => ({ contactId, tagId })))
        .onConflictDoNothing()
    }

    return survivors.length
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
    const existing = await contactInboxService.findExistingSourceIds({
      inboxId: deps.inbox.id,
      sourceIds: externalIds,
    })

    const eligible = contacts.filter(
      (row) => !existing.has(row.externalId as string),
    )
    if (eligible.length === 0) {
      return { success: 0, failed: total }
    }

    const inserted = await insertContactBatch(deps, eligible, ctx)

    if (inserted > 0) {
      await quotaEnforcementService.incrementBy({
        userId: deps.ownerId,
        metric: "contacts",
        count: inserted,
      })
      await workspaceUsageService
        .increment(ctx.row.workspaceId, "contacts", inserted)
        .catch((err) => {
          logger.warn(
            { err, workspaceId: ctx.row.workspaceId },
            "workspace usage contact increment failed",
          )
        })
    }

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
