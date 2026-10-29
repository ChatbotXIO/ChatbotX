import {
  contactReferralEventService,
  customFieldService,
  tagService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { normalizeStoredTimezone } from "@chatbotx.io/business/contact-locale"
import {
  type CustomFieldType,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import {
  applyContactFilter,
  pruneEmailPhoneFilterConditions,
} from "@chatbotx.io/database/queries"
import {
  type ContactExportRelations,
  type ContactExportRow,
  contactRepository,
  fileRepository,
} from "@chatbotx.io/database/repositories"
import { chunkById } from "@chatbotx.io/database/utils"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import { toUploadWriter } from "@chatbotx.io/filesystem/upload-writer"
import { SOURCE_USER_ID_EXPORT_HEADER } from "@chatbotx.io/imports/modules/contacts"
import { formatCustomFieldValueInTimeZone } from "@chatbotx.io/utils/datetime"
import {
  type JobExportContacts,
  loopableItemsCount,
} from "@chatbotx.io/worker-config"
import { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

type ExportData = JobExportContacts["data"]

// Field-key prefixes used by the builder when it sends the selected columns.
const contactFieldPrefix = "sys:"
const customFieldPrefix = "cus:"
const tagPrefix = "tag:"

// Virtual contact column backed by the first ContactInbox.sourceId (the
// platform-native id: WhatsApp wa_id, Messenger PSID, …). It is not a column on
// the Contact row, so renderCell resolves it from the contactInboxes relation.
const contactIdField = "contactId"

// Virtual contact column backed by the first contactInboxes row that carries a
// non-null sourceUserId (channel-agnostic today; only whatsapp populates it —
// see `resolveSourceUserId`). Not a column on the Contact row.
const sourceUserIdField = "sourceUserId"

// Virtual contact column listing every ad the contact came from (the same list
// as the `{{ad_ids}}` system field). It lives in the ContactReferralEvent log,
// not on the Contact row, so it is loaded per page and only when selected.
const adIdsField = "adIds"

// Human-readable headers for built-in contact columns.
const headerNames: Record<string, string> = {
  contactId: "Contact ID",
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Full Name",
  email: "Email",
  phoneNumber: "Phone Number",
  gender: "Gender",
  source: "Source",
  lastReadAt: "Last Read At",
  blockedAt: "Blocked At",
  sourceUserId: SOURCE_USER_ID_EXPORT_HEADER,
  adIds: "Ad IDs",
}

export type SelectedField =
  | { type: "contact"; value: string; header: string }
  | {
      type: "custom"
      value: string
      header: string
      customFieldType?: CustomFieldType
    }
  | { type: "tag"; value: string; header: string }

type ContactRow = {
  [key: string]: unknown
  contactCustomFields?: ContactExportRow["contactCustomFields"]
  tags?: ContactExportRow["tags"]
  contactInboxes?: ContactExportRow["contactInboxes"]
  /** Set by `withAdIds` when the Ad IDs column is selected. */
  adIds?: string[]
}

// ── CSV serialization ─────────────────────────────────────────────────────────

// Leading characters a spreadsheet may interpret as a formula on open.
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/

/**
 * Wraps a value in double quotes, escapes embedded quotes/newlines, and guards
 * against CSV formula injection by prefixing a single quote when the value
 * starts with a character a spreadsheet would evaluate.
 */
export const escapeCsvValue = (value: string): string => {
  if (!value) {
    return '""'
  }
  const normalized = value.replace(/\r?\n/g, " ")
  const guarded = FORMULA_PREFIX_RE.test(normalized)
    ? `'${normalized}`
    : normalized
  return `"${guarded.replace(/"/g, '""')}"`
}

/** Renders an optional identity value as a CSV cell (empty cell when absent). */
const renderIdentityCell = (value: string | undefined): string =>
  value ? escapeCsvValue(value) : '""'

// Resolves the export's WhatsApp User ID column: the first contactInboxes row
// that actually carries a sourceUserId — not blindly the earliest inbox
// connection, since a multi-inbox contact's earliest row may belong to a
// different channel that never populates it.
const resolveSourceUserId = (contact: ContactRow): string | undefined =>
  contact.contactInboxes?.find((inbox) => inbox.sourceUserId)?.sourceUserId ??
  undefined

/** Renders one selected field of one contact into a CSV cell. */
const renderCell = (
  contact: ContactRow,
  field: SelectedField,
  timezone: string,
): string => {
  if (field.type === "contact") {
    // The Contact Id column is not stored on the Contact row — it comes from the
    // contact's first (earliest) inbox connection's platform-native sourceId.
    if (field.value === contactIdField) {
      return renderIdentityCell(contact.contactInboxes?.[0]?.sourceId)
    }
    if (field.value === sourceUserIdField) {
      return renderIdentityCell(resolveSourceUserId(contact))
    }
    if (field.value === adIdsField) {
      return renderIdentityCell(contact.adIds?.join(", "))
    }
    const rawValue = contact[field.value]
    if (rawValue instanceof Date) {
      return escapeCsvValue(rawValue.toISOString())
    }
    if (rawValue === null || rawValue === undefined) {
      return '""'
    }
    return escapeCsvValue(String(rawValue))
  }

  if (field.type === "custom") {
    const customField = contact.contactCustomFields?.find(
      (cf) => cf.customFieldId === field.value,
    )
    return customField?.value
      ? escapeCsvValue(
          formatCustomFieldValueInTimeZone(
            field.customFieldType ?? "shortText",
            customField.value,
            timezone,
          ),
        )
      : '""'
  }

  const hasTag = contact.tags?.some((tag) => tag.id === field.value)
  return escapeCsvValue(hasTag ? "Yes" : "No")
}

/** Builds the CSV body for a page of contacts (one row per contact). */
export const buildCsvChunk = (
  contacts: ContactRow[],
  selectedFields: SelectedField[],
  timezone = "UTC",
): string => {
  const lines = contacts.map((contact) =>
    selectedFields
      .map((field) => renderCell(contact, field, timezone))
      .join(","),
  )
  return lines.length > 0 ? `${lines.join("\n")}\n` : ""
}

/** Builds the CSV header row from the selected fields. */
export const buildHeaderLine = (selectedFields: SelectedField[]): string =>
  `${selectedFields.map((field) => escapeCsvValue(field.header)).join(",")}\n`

// ── Where building ────────────────────────────────────────────────────────────

/**
 * Mirrors the builder's generateWhere so the worker resolves the exact same
 * contacts the user saw when they triggered the export. When an explicit list
 * of `contactIds` was sent the filter is ignored; otherwise keyword + saved
 * contact filter are combined.
 */
export const buildBaseWhere = (data: ExportData): Record<string, unknown> => {
  const where: Record<string, unknown> = { workspaceId: data.workspaceId }

  if (!data.filter) {
    where.id = { in: data.contactIds }
    addAssignedContactScope(where, data.restrictToAssignedUserId)
    return where
  }

  if (data.filter.keyword) {
    const keyword = `%${data.filter.keyword.toLowerCase()}%`
    where.OR = [
      { firstName: { ilike: keyword } },
      { lastName: { ilike: keyword } },
      ...(data.canExportEmailAndPhone === true
        ? [{ email: { ilike: keyword } }, { phoneNumber: { ilike: keyword } }]
        : []),
    ]
  }

  const contactFilter = pruneEmailPhoneFilterConditions(
    data.filter.contactFilter,
    data.canExportEmailAndPhone === true,
  )

  if (contactFilter) {
    Object.assign(where, applyContactFilter(contactFilter, data.workspaceId))
  }

  addAssignedContactScope(where, data.restrictToAssignedUserId)

  return where
}

const addAssignedContactScope = (
  where: Record<string, unknown>,
  restrictToAssignedUserId?: string,
) => {
  if (!restrictToAssignedUserId) {
    return
  }

  const conversation =
    typeof where.conversation === "object" &&
    where.conversation !== null &&
    !Array.isArray(where.conversation)
      ? where.conversation
      : {}

  where.conversation = {
    ...conversation,
    assignedUserId: restrictToAssignedUserId,
  }
}

// ── Selected-field resolution ─────────────────────────────────────────────────

type RawField = { type: "tag" | "custom" | "contact"; value: string }

/** Splits the raw field keys into typed entries by their prefix. */
const parseRawFields = (fields: string[]): RawField[] => {
  const parsed: RawField[] = []
  for (const field of fields) {
    if (field.startsWith(tagPrefix)) {
      parsed.push({ type: "tag", value: field.slice(tagPrefix.length) })
    } else if (field.startsWith(customFieldPrefix)) {
      parsed.push({
        type: "custom",
        value: field.slice(customFieldPrefix.length),
      })
    } else if (field.startsWith(contactFieldPrefix)) {
      parsed.push({
        type: "contact",
        value: field.slice(contactFieldPrefix.length),
      })
    }
  }
  return parsed
}

/** Loads a name-by-id map for the given ids, or an empty map when none. */
const loadNameMap = async (
  ids: string[],
  load: (ids: string[]) => Promise<{ id: string; name: string }[]>,
): Promise<Record<string, string>> => {
  if (ids.length === 0) {
    return {}
  }
  const rows = await load(ids)
  return Object.fromEntries(rows.map((row) => [row.id, row.name]))
}

const loadCustomFieldMap = async (
  ids: string[],
  workspaceId: string,
): Promise<Record<string, { name: string; type: CustomFieldType }>> => {
  if (ids.length === 0) {
    return {}
  }

  const rows = await customFieldService.findManyByIds({ workspaceId, ids })

  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        name: row.name,
        type: row.type,
      },
    ]),
  )
}

/**
 * Resolves the raw field keys into {@link SelectedField}s with display headers,
 * looking up tag and custom-field names from the database.
 */
export const buildSelectedFields = async (
  fields: string[],
  workspaceId: string,
): Promise<SelectedField[]> => {
  const rawFields = parseRawFields(fields)

  const idsOfType = (type: RawField["type"]): string[] =>
    rawFields.filter((field) => field.type === type).map((field) => field.value)

  const [tagNameById, customFieldById] = await Promise.all([
    loadNameMap(idsOfType("tag"), (ids) =>
      tagService.findManyByIds({ workspaceId, ids }),
    ),
    loadCustomFieldMap(idsOfType("custom"), workspaceId),
  ])

  return rawFields.map((field) => {
    if (field.type === "contact") {
      return {
        type: "contact",
        value: field.value,
        header: headerNames[field.value] ?? field.value,
      }
    }
    if (field.type === "custom") {
      const customField = customFieldById[field.value]
      return {
        type: "custom",
        value: field.value,
        header: customField?.name ?? field.value,
        customFieldType: customField?.type ?? "shortText",
      }
    }
    return {
      type: "tag",
      value: field.value,
      header: tagNameById[field.value] ?? field.value,
    }
  })
}

// ── Streaming helpers ─────────────────────────────────────────────────────────

/** Only the relations the selected columns render are loaded per page. */
export const resolveExportRelations = (
  selectedFields: SelectedField[],
): ContactExportRelations => {
  const valuesOf = (type: SelectedField["type"]) =>
    selectedFields
      .filter((field) => field.type === type)
      .map((field) => field.value)
  const contactColumns = new Set(valuesOf("contact"))

  let contactInboxes: ContactExportRelations["contactInboxes"] = "none"
  if (contactColumns.has(sourceUserIdField)) {
    contactInboxes = "all"
  } else if (contactColumns.has(contactIdField)) {
    contactInboxes = "earliest"
  }

  return {
    customFieldIds: valuesOf("custom"),
    tagIds: valuesOf("tag"),
    contactInboxes,
  }
}

/**
 * Fetches one page of contacts for the export, keyset-paginated on the bigint
 * primary key. Only `loopableItemsCount` rows are ever held in memory.
 */
const fetchContactPage = (
  baseWhere: Record<string, unknown>,
  lastId: string | null,
  relations: ContactExportRelations,
) =>
  contactRepository.listForExportPage({
    where: lastId ? { AND: [baseWhere, { id: { gt: lastId } }] } : baseWhere,
    limit: loopableItemsCount,
    relations,
  })

/**
 * Adds each contact's ad ids to a page: one query per page, not one per
 * contact.
 */
const withAdIds = async <Row extends { id: string }>(
  page: Row[],
  workspaceId: string,
): Promise<(Row & { adIds: string[] })[]> => {
  const adIdsByContact = await contactReferralEventService.listAdIdsByContacts({
    workspaceId,
    contactIds: page.map((contact) => contact.id),
  })
  return page.map((contact) => ({
    ...contact,
    adIds: adIdsByContact.get(contact.id) ?? [],
  }))
}

/** Updates the export's File row, scoped to its workspace. */
const updateExportFile = (
  ids: { fileId: string; workspaceId: string },
  values: Parameters<typeof fileRepository.updateForWorkspace>[0]["values"],
): Promise<unknown> =>
  fileRepository.updateForWorkspace({
    id: ids.fileId,
    workspaceId: ids.workspaceId,
    values,
  })

// H-3: Memory stays flat at one page whatever the size, so this cap only bounds
// how long one job holds a default-queue slot (a full export runs for hours,
// and a worker restart reruns it from the start). Narrow beyond it with filters.
const MAX_EXPORT_ROWS = 10_000_000

/** Progress is persisted at most this often; final counts are always written. */
const PROGRESS_INTERVAL_MS = 5000

// ── Handler ───────────────────────────────────────────────────────────────────

export const loopableExportContacts = async (data: ExportData) =>
  runJobWithAuditContext(
    {
      requestedUserId: data.requestedUserId,
      workspaceId: data.workspaceId,
      source: "default:exportContacts",
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    },
    () => loopableExportContactsInner(data),
  )

const loopableExportContactsInner = async (data: ExportData) => {
  const { workspaceId, fileId, fields, outputPath, outputFormat } = data
  const fileIds = { fileId, workspaceId }

  if (outputFormat !== "csv") {
    return
  }

  const selectedFields = await buildSelectedFields(
    stripContactPIIFields(fields, data.canExportEmailAndPhone === true),
    workspaceId,
  )
  const workspace = await workspaceService.find({
    where: { id: workspaceId },
  })
  const workspaceTimezone =
    normalizeStoredTimezone(workspace?.timezone) ?? "UTC"
  const baseWhere = buildBaseWhere(data)

  const relations = resolveExportRelations(selectedFields)
  const includeAdIds = selectedFields.some(
    (field) => field.type === "contact" && field.value === adIdsField,
  )
  const upload = toUploadWriter(
    createUpload(outputPath, { contentType: "text/csv; charset=utf-8" }),
  )

  let totalBytes = 0
  let totalRecords = 0
  let progressSavedAt = Date.now()

  try {
    const headerLine = buildHeaderLine(selectedFields)
    await upload.write(headerLine)
    totalBytes += Buffer.byteLength(headerLine)

    let hitRowCap = false
    await chunkById(
      async (lastId) => {
        const page = await fetchContactPage(baseWhere, lastId, relations)
        return includeAdIds ? await withAdIds(page, workspaceId) : page
      },
      {
        chunkSize: loopableItemsCount,
        callback: async (page): Promise<boolean | undefined> => {
          const chunk = buildCsvChunk(page, selectedFields, workspaceTimezone)
          await upload.write(chunk)
          totalBytes += Buffer.byteLength(chunk)
          totalRecords += page.length

          // Progress for the export dialog, throttled: a large export has
          // thousands of pages.
          if (Date.now() - progressSavedAt >= PROGRESS_INTERVAL_MS) {
            await updateExportFile(fileIds, { meta: { totalRecords } })
            progressSavedAt = Date.now()
          }

          if (totalRecords >= MAX_EXPORT_ROWS) {
            hitRowCap = true
            return false
          }

          return
        },
      },
    )

    await upload.finish()

    if (hitRowCap) {
      await updateExportFile(fileIds, {
        status: fileStatuses.enum.failed,
        meta: { totalRecords },
      })
      throw new Error(
        `Export exceeded the ${MAX_EXPORT_ROWS.toLocaleString()}-row limit. Use filters to narrow the export.`,
      )
    }

    // No contact matched the filter — surface it as a failed export rather
    // than handing the user an empty file.
    const finalStatus =
      totalRecords === 0 ? fileStatuses.enum.failed : fileStatuses.enum.uploaded

    await updateExportFile(fileIds, {
      status: finalStatus,
      fileSize: String(totalBytes),
      meta: { totalRecords },
    })

    if (finalStatus === fileStatuses.enum.uploaded) {
      await auditService.record({
        action: "export",
        detail: "exported contacts",
        userId: data.requestedUserId,
        workspaceId: data.workspaceId,
        source: "default:exportContacts",
      })
    }
  } catch (error) {
    await upload.abort()
    await updateExportFile(fileIds, { status: fileStatuses.enum.failed })
    throw error
  }
}
