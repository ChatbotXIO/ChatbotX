import {
  exportSubTypes,
  fileContextTypes,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { fileRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

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
    const status = file.status as "pending" | "uploaded" | "failed"
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
}
export const contactExportService = new ContactExportService()
