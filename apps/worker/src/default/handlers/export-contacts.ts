import type { PassThrough } from "node:stream"
import { and, db, eq } from "@chatbotx.io/database/client"
import { fileStatuses } from "@chatbotx.io/database/partials"
import { applyContactFilter } from "@chatbotx.io/database/queries"
import {
  type contactCustomFieldModel,
  fileModel,
} from "@chatbotx.io/database/schema"
import { chunkById } from "@chatbotx.io/database/utils"
import { uploader } from "@chatbotx.io/filesystem"
import {
  type JobExportContacts,
  loopableItemsCount,
} from "@chatbotx.io/worker-config"

type ExportData = JobExportContacts["data"]

// Field-key prefixes used by the builder when it sends the selected columns.
const contactFieldPrefix = "sys:"
const customFieldPrefix = "cus:"
const tagPrefix = "tag:"

// Human-readable headers for built-in contact columns.
const headerNames: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Full Name",
  email: "Email",
  phoneNumber: "Phone Number",
  gender: "Gender",
  source: "Source",
  lastReadAt: "Last Read At",
  blockedAt: "Blocked At",
}

export type SelectedField =
  | { type: "contact"; value: string; header: string }
  | { type: "custom"; value: string; header: string }
  | { type: "tag"; value: string; header: string }

type ContactRow = {
  [key: string]: unknown
  contactCustomFields?: (typeof contactCustomFieldModel.$inferSelect)[]
  tags?: { id: string }[]
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

/** Renders one selected field of one contact into a CSV cell. */
const renderCell = (contact: ContactRow, field: SelectedField): string => {
  if (field.type === "contact") {
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
    return customField?.value ? escapeCsvValue(customField.value) : '""'
  }

  const hasTag = contact.tags?.some((tag) => tag.id === field.value)
  return escapeCsvValue(hasTag ? "Yes" : "No")
}

/** Builds the CSV body for a page of contacts (one row per contact). */
export const buildCsvChunk = (
  contacts: ContactRow[],
  selectedFields: SelectedField[],
): string => {
  const lines = contacts.map((contact) =>
    selectedFields.map((field) => renderCell(contact, field)).join(","),
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
    return where
  }

  if (data.filter.keyword) {
    const keyword = `%${data.filter.keyword.toLowerCase()}%`
    where.OR = [
      { firstName: { ilike: keyword } },
      { lastName: { ilike: keyword } },
      { email: { ilike: keyword } },
      { phoneNumber: { ilike: keyword } },
    ]
  }

  if (data.filter.contactFilter) {
    Object.assign(where, applyContactFilter(data.filter.contactFilter))
  }

  return where
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

  const [tagNameById, customFieldNameById] = await Promise.all([
    loadNameMap(idsOfType("tag"), (ids) =>
      db.query.tagModel.findMany({ where: { id: { in: ids }, workspaceId } }),
    ),
    loadNameMap(idsOfType("custom"), (ids) =>
      db.query.customFieldModel.findMany({
        where: { id: { in: ids }, workspaceId },
      }),
    ),
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
      return {
        type: "custom",
        value: field.value,
        header: customFieldNameById[field.value] ?? field.value,
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

/**
 * Writes one chunk and resolves once the consumer has handled it, which applies
 * natural backpressure so the producer never outruns the upload.
 */
const writeToStream = (stream: PassThrough, chunk: string): Promise<void> =>
  new Promise((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })

/**
 * Fetches one page of contacts for the export, keyset-paginated on the bigint
 * primary key. Only `loopableItemsCount` rows are ever held in memory.
 */
const fetchContactPage = (
  baseWhere: Record<string, unknown>,
  lastId: string | null,
) =>
  db.query.contactModel.findMany({
    where: lastId ? { AND: [baseWhere, { id: { gt: lastId } }] } : baseWhere,
    with: { contactCustomFields: true, tags: true },
    limit: loopableItemsCount,
    orderBy: { id: "asc" },
  })

/** Updates the export's File row, scoped to its workspace. */
const updateExportFile = (
  ids: { fileId: string; workspaceId: string },
  values: Partial<typeof fileModel.$inferInsert>,
): Promise<unknown> =>
  db
    .update(fileModel)
    .set(values)
    .where(
      and(
        eq(fileModel.id, ids.fileId),
        eq(fileModel.workspaceId, ids.workspaceId),
      ),
    )

// H-3: Cap exports to avoid a single job monopolising a worker slot for hours
// on large workspaces. Users who need more should use filtered exports or
// contact the team for a bulk extraction.
const MAX_EXPORT_ROWS = 500_000

// ── Handler ───────────────────────────────────────────────────────────────────

export const loopableExportContacts = async (data: ExportData) => {
  const { workspaceId, fileId, fields, outputPath, outputFormat } = data
  const fileIds = { fileId, workspaceId }

  if (outputFormat !== "csv") {
    return
  }

  const selectedFields = await buildSelectedFields(fields, workspaceId)
  const baseWhere = buildBaseWhere(data)

  const { stream, done } = uploader.createUpload(outputPath, {
    contentType: "text/csv; charset=utf-8",
  })

  let totalBytes = 0
  let totalRecords = 0

  try {
    const headerLine = buildHeaderLine(selectedFields)
    await writeToStream(stream, headerLine)
    totalBytes += Buffer.byteLength(headerLine)

    let hitRowCap = false
    await chunkById((lastId) => fetchContactPage(baseWhere, lastId), {
      chunkSize: loopableItemsCount,
      callback: async (page): Promise<boolean | undefined> => {
        const chunk = buildCsvChunk(page, selectedFields)
        await writeToStream(stream, chunk)
        totalBytes += Buffer.byteLength(chunk)
        totalRecords += page.length

        // Persist progress after each chunk so the File row reflects how many
        // records have been written so far.
        await updateExportFile(fileIds, { meta: { totalRecords } })

        if (totalRecords >= MAX_EXPORT_ROWS) {
          hitRowCap = true
          return false
        }

        return
      },
    })

    if (hitRowCap) {
      stream.end()
      await done
      await updateExportFile(fileIds, {
        status: fileStatuses.enum.failed,
        meta: { totalRecords },
      })
      throw new Error(
        `Export exceeded the ${MAX_EXPORT_ROWS.toLocaleString()}-row limit. Use filters to narrow the export.`,
      )
    }

    stream.end()
    await done

    // No contact matched the filter — surface it as a failed export rather
    // than handing the user an empty file.
    const finalStatus =
      totalRecords === 0 ? fileStatuses.enum.failed : fileStatuses.enum.uploaded

    await updateExportFile(fileIds, {
      status: finalStatus,
      fileSize: String(totalBytes),
      meta: { totalRecords },
    })
  } catch (error) {
    // Destroy the source stream and wait for the multipart upload to settle so
    // lib-storage aborts the partial upload (default leavePartsOnError=false)
    // instead of leaving orphaned S3 parts behind.
    stream.destroy()
    await done.catch(() => undefined)
    await updateExportFile(fileIds, { status: fileStatuses.enum.failed })
    throw error
  }
}
