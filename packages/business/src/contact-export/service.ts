import {
  CONTACT_EXPORT_RETENTION_DAYS,
  exportSubTypes,
  type FileStatus,
  fileContextTypes,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import {
  type ExportFileCursor,
  fileRepository,
} from "@chatbotx.io/database/repositories"

import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { logger } from "../logger"

/** How long a contact export is kept before the daily sweep may delete it. */
const RETENTION_MS = CONTACT_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** A keyset position over contact exports (see {@link ExportFileCursor}). */
export type ContactExportCursor = ExportFileCursor

export type ContactExportFileSummary = {
  id: string
  status: FileStatus
  fileName: string
  totalRecords: number | null
  createdAt: Date
  /** When the export is past its retention; the daily sweep deletes it next. */
  expiresAt: Date
  /** Who started it; null for an API token or a since-deleted member. */
  requestedBy: { id: string; name: string | null } | null
}

class ContactExportService extends BaseService {
  async start(props: {
    workspaceId: string
    requestedUserId: string | null
    canExportEmailAndPhone: boolean
    restrictToAssignedUserId?: string
    fields: string[]
    exportAll?: boolean
    filter?: { keyword?: string; contactFilter?: ContactFilterCriteriaInput }
    contactIds?: string[]
    actor?: { ipAddress?: string; userAgent?: string }
  }) {
    const {
      workspaceId,
      requestedUserId,
      canExportEmailAndPhone,
      restrictToAssignedUserId,
      actor,
      ...parsedInput
    } = props

    const fields = stripContactPIIFields(
      parsedInput.fields,
      canExportEmailAndPhone,
    )

    // The worker resolves the filter and counts records. This only records the
    // export request and enqueues the job.
    const filter = parsedInput.exportAll
      ? {
          keyword: parsedInput.filter?.keyword,
          contactFilter: parsedInput.filter?.contactFilter,
        }
      : undefined
    const contactIds = parsedInput.exportAll
      ? undefined
      : (parsedInput.contactIds ?? [])

    const fileId = createId()
    const fileName = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
    const outputPath = `workspaces/${workspaceId}/exports/contacts/contact_${fileId}.csv`

    await fileRepository.create({
      id: fileId,
      workspaceId,
      userId: requestedUserId,
      contextType: fileContextTypes.enum.export,
      subType: exportSubTypes.enum.contacts,
      path: outputPath,
      fileName,
      mimeType: "text/csv",
      status: fileStatuses.enum.pending,
    })

    await defaultQueue.add(DefaultJobAction.exportContacts, {
      type: DefaultJobAction.exportContacts,
      data: {
        workspaceId,
        requestedUserId: requestedUserId ?? undefined,
        fileId,
        fields,
        canExportEmailAndPhone,
        outputPath,
        outputFormat: "csv",
        ipAddress: actor?.ipAddress,
        userAgent: actor?.userAgent,
        ...(restrictToAssignedUserId ? { restrictToAssignedUserId } : {}),
        ...(filter ? { filter } : { contactIds: contactIds ?? [] }),
      },
    })

    return { fileId }
  }

  async getFile(props: {
    workspaceId: string
    fileId: string
    userId?: string
  }) {
    const file = await fileRepository.findByIdForWorkspace({
      id: props.fileId,
      workspaceId: props.workspaceId,
      userId: props.userId,
    })
    if (!file) {
      throw notFoundException("Export file not found")
    }
    const { status } = file
    // Short TTL limits the exposure window if the URL leaks via browser
    // history, Referer headers, or analytics scripts.
    const downloadUrl =
      status === "uploaded"
        ? await uploader.getPresignedDownload(file.path, 300)
        : null
    return {
      status,
      fileName: file.fileName,
      downloadUrl,
      totalRecords: file.meta?.totalRecords ?? null,
    }
  }

  /**
   * A workspace's contact exports, newest first. `userId` narrows the list to
   * the exports its creator started; the caller decides who may see all of
   * them. Download links are not included: `getFile` signs a fresh one.
   */
  async listFiles(props: {
    workspaceId: string
    userId?: string
    limit: number
    cursor?: ContactExportCursor
  }): Promise<{
    data: ContactExportFileSummary[]
    nextCursor: ContactExportCursor | null
  }> {
    const rows = await fileRepository.listExportsForWorkspace({
      workspaceId: props.workspaceId,
      subType: exportSubTypes.enum.contacts,
      userId: props.userId,
      limit: props.limit,
      cursor: props.cursor,
    })
    const page = rows.slice(0, props.limit)
    const last = page.at(-1)

    return {
      data: page.map((row) => ({
        id: row.id,
        status: row.status,
        fileName: row.fileName,
        totalRecords: row.meta?.totalRecords ?? null,
        createdAt: row.createdAt,
        expiresAt: new Date(row.createdAt.getTime() + RETENTION_MS),
        requestedBy: row.userId
          ? { id: row.userId, name: row.requestedByName }
          : null,
      })),
      nextCursor:
        rows.length > props.limit && last
          ? { createdAt: last.createdAtCursor, id: last.id }
          : null,
    }
  }

  /**
   * Deletes one batch of contact exports older than the retention: the stored
   * CSV first, then its row. A failed object delete keeps the row so the next
   * sweep retries it; S3 treats a missing object as deleted, so a retry after
   * a half-done pass is safe. Returns how many rows were removed, how many
   * were left for a retry, and, after a full batch, where the next batch
   * starts (past the kept rows, so they cannot stall the sweep).
   */
  async purgeExpired(props: {
    batchSize: number
    now?: Date
    after?: ContactExportCursor
  }): Promise<{
    deleted: number
    failed: number
    nextCursor: ContactExportCursor | null
  }> {
    const now = props.now ?? new Date()
    const expired = await fileRepository.listExportsCreatedBefore({
      subType: exportSubTypes.enum.contacts,
      before: new Date(now.getTime() - RETENTION_MS),
      limit: props.batchSize,
      after: props.after,
    })

    let deleted = 0
    let failed = 0
    for (const file of expired) {
      try {
        await uploader.deleteObject(file.path)
      } catch (error) {
        failed++
        logger.warn(
          { err: error, fileId: file.id, workspaceId: file.workspaceId },
          "contactExport.purgeExpired: could not delete the export file, keeping its row for a retry",
        )
        continue
      }
      await fileRepository.deleteById({ id: file.id })
      deleted++
    }
    const last = expired.at(-1)
    return {
      deleted,
      failed,
      nextCursor:
        expired.length === props.batchSize && last
          ? { createdAt: last.createdAtCursor, id: last.id }
          : null,
    }
  }
}
export const contactExportService = new ContactExportService()
