"use server"

import { db } from "@chatbotx.io/database/client"
import {
  exportSubTypes,
  fileContextTypes,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { fileModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ExportContactsRequest,
  type ExportContactsResponse,
  exportContactsRequest,
} from "../schemas/action"

export const exportContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(exportContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ExportContactsRequest
    }): Promise<ExportContactsResponse> => {
      const { fields } = parsedInput

      // The worker resolves the filter and counts records. The action only
      // records the export request and enqueues the job.
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

      await db.insert(fileModel).values({
        id: fileId,
        workspaceId,
        userId: user.id,
        contextType: fileContextTypes.enum.export,
        subType: exportSubTypes.enum.contacts,
        path: outputPath,
        fileName,
        mimeType: "text/csv",
        status: fileStatuses.enum.pending,
      })

      await Promise.all([
        defaultQueue.add(DefaultJobAction.exportContacts, {
          type: DefaultJobAction.exportContacts,
          data: {
            workspaceId,
            requestedUserId: user.id,
            fileId,
            fields,
            outputPath,
            outputFormat: "csv",
            ...(filter ? { filter } : { contactIds: contactIds ?? [] }),
          },
        }),
        defaultQueue.add(DefaultJobAction.sendAuditLog, {
          type: DefaultJobAction.sendAuditLog,
          data: {
            userId: user.id,
            workspaceId,
            action: "export",
            detail: "Contacts",
          },
        }),
      ])

      return { fileId }
    },
  )
