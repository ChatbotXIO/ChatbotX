import {
  botFieldService,
  contactCustomFieldService,
  contactInboxService,
  messageCleanupService,
  quotaEnforcementService,
  workspaceService,
  workspaceUsageService,
} from "@chatbotx.io/business"
import { validateCustomFieldValue } from "@chatbotx.io/business/javascript-execution"
import { db, inArray } from "@chatbotx.io/database/client"
import {
  type ContactImportFieldMapping,
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
import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../../../lib/logger"
import type {
  BatchResult,
  ImportPrepareResult,
  ImportRow,
  ImportTypeHandler,
} from "../../base-import"
import {
  type ContactRow,
  extractRowData,
  readMappedColumnValue,
} from "./extractor"

type ContactDeps = {
  customFieldTypes: Map<string, CustomFieldType>
  inbox: typeof inboxModel.$inferSelect
  ownerId: string
  /** `fieldMapping` entries targeting contact custom fields (per-row). */
  customMappings: ContactImportFieldMapping
  /**
   * `fieldMapping` entries targeting workspace-level bot fields
   * (`bot_field:<id>` references from the combined picker). A bot field holds
   * one value per workspace, so writing it per row would just be N-1 wasted
   * overwrites — instead the latest mapped value is tracked here and applied
   * once in `finalize` (last valid row wins).
   */
  botMappings: Array<{ column: string; botFieldId: string }>
  /** Types of the mapped bot fields, resolved once in `prepare` (batched). */
  botFieldTypes: Map<string, CustomFieldType>
  /** Already-normalized (canonical) values — see `processContactRow`. */
  botFieldLatest: Map<string, string>
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
  // Split the mapping by target: contact custom fields stay per-row; bot
  // field references are collected during row processing and applied once
  // after completion.
  const customMappings: ContactImportFieldMapping = []
  const botMappings: Array<{ column: string; botFieldId: string }> = []
  for (const mapping of meta.fieldMapping ?? []) {
    const parsed = parseFieldReference(mapping.customFieldId)
    if (parsed.kind === FieldReferenceKind.botField) {
      botMappings.push({ column: mapping.column, botFieldId: parsed.id })
    } else {
      customMappings.push(mapping)
    }
  }

  const customFieldIds = customMappings.map((m) => m.customFieldId)
  const botFieldIds = [...new Set(botMappings.map((m) => m.botFieldId))]

  const [inbox, workspace, tag, fields, botFields] = await Promise.all([
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
    // Batched once here (not per-row) so `processContactRow` can validate
    // each candidate value against the SAME lenient normalizer used for
    // custom fields instead of leaving it to the strict runtime coercion
    // `botFieldService.updateByKey` applies in `finalize`.
    botFieldIds.length
      ? botFieldService.findManyByIds({
          workspaceId: row.workspaceId,
          ids: botFieldIds,
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

  const botFieldTypes = new Map<string, CustomFieldType>()
  for (const field of botFields) {
    botFieldTypes.set(field.id, field.type)
  }

  return {
    ok: true,
    deps: {
      customFieldTypes,
      inbox,
      ownerId: workspace.ownerId,
      customMappings,
      botMappings,
      botFieldTypes,
      botFieldLatest: new Map<string, string>(),
    },
  }
}

const processContactRow = (
  deps: ContactDeps,
  rawRow: Record<string, unknown>,
  meta: ContactImportMeta,
): ContactRow | null => {
  const mapped = extractRowData(rawRow, meta.columnMap, deps.customMappings, {
    countryCode: meta.countryCode,
    channel: meta.channel,
  })
  if (!mapped) {
    return null
  }

  // Bot-field-mapped columns: remember the latest VALID, non-blank value from
  // each row, normalized through the SAME lenient normalizer CSV custom-field
  // imports use (`validateCustomFieldValue` — accepts e.g. a loose date like
  // `28/08/2026`). A blank cell is skipped outright; a non-blank cell that
  // fails to normalize for the field's type is also skipped so the
  // previously tracked valid value survives (last VALID row wins). The
  // tracked value is already canonical, so `finalize`'s
  // `botFieldService.updateByKey` write is a no-op re-normalization.
  for (const mapping of deps.botMappings) {
    const type = deps.botFieldTypes.get(mapping.botFieldId)
    if (!type) {
      continue
    }
    const value = readMappedColumnValue(rawRow, mapping.column)
    if (value === undefined) {
      continue
    }
    const normalized = validateCustomFieldValue(type, value, meta.timezone)
    if (normalized !== null) {
      deps.botFieldLatest.set(mapping.botFieldId, normalized)
    }
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

const collectSourceUserIds = (rows: ContactRow[]): string[] =>
  rows.flatMap((row) => (row.sourceUserId ? [row.sourceUserId] : []))

// A row is a duplicate when its externalId already matches an existing
// ContactInbox.sourceId OR its sourceUserId already matches an existing
// ContactInbox.sourceUserId (a phone-keyed row that already learned this
// scoped id must not be duplicated — mirrors live-webhook dedup).
const isDuplicateIdentity = (
  row: ContactRow,
  existing: { sourceIds: Set<string>; sourceUserIds: Set<string> },
): boolean =>
  Boolean(row.externalId && existing.sourceIds.has(row.externalId)) ||
  Boolean(row.sourceUserId && existing.sourceUserIds.has(row.sourceUserId))

// Re-checks candidate rows against the inbox's current identities and drops
// duplicates. Used both as the pre-check before building the insert batch and
// as the race-window re-check immediately before the insert.
const filterEligibleRows = async (
  inboxId: string,
  rows: ContactRow[],
): Promise<ContactRow[]> => {
  const existing = await contactInboxService.findExistingSourceIdentities({
    inboxId,
    sourceIds: rows.map((row) => row.externalId as string),
    sourceUserIds: collectSourceUserIds(rows),
  })
  return rows.filter((row) => !isDuplicateIdentity(row, existing))
}

// Import only creates contact records: the info-only `contacts` metric is
// counted (see processContactBatch), but MAC is never reserved here — MAC is
// counted later only when a real interaction occurs.
const insertContactBatch = async (
  deps: ContactDeps,
  eligible: ContactRow[],
  ctx: { row: ImportRow; meta: ContactImportMeta },
): Promise<number> => {
  const freshEligible = await filterEligibleRows(deps.inbox.id, eligible)
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
            sourceUserId: row.sourceUserId ?? null,
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

    const eligible = await filterEligibleRows(deps.inbox.id, contacts)
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

/**
 * Applies the bot-field-mapped values collected during row processing once
 * after the import completes (last valid row wins). Values in
 * `botFieldLatest` were already validated/normalized per-row in
 * `processContactRow` via `validateCustomFieldValue` (the same lenient
 * normalizer used for custom fields), so `updateByKey`'s own runtime
 * coercion is idempotent here — re-running it on an already-canonical value
 * (e.g. an ISO temporal literal passes Strict) is a no-op. The try/catch
 * remains defense-in-depth for genuine write failures (DB error, field
 * deleted mid-import): logged and skipped, never failing the import.
 */
const finalizeContacts = async (ctx: {
  row: ImportRow
  meta: ContactImportMeta
  deps: ContactDeps
}): Promise<void> => {
  for (const [botFieldId, value] of ctx.deps.botFieldLatest) {
    try {
      await botFieldService.updateByKey({
        workspaceId: ctx.row.workspaceId,
        key: botFieldId,
        data: { value },
      })
    } catch (error) {
      logger.error(
        {
          err: error,
          workspaceId: ctx.row.workspaceId,
          botFieldId,
        },
        "Import bot field value update failed; skipping",
      )
    }
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
  finalize: finalizeContacts,
}
