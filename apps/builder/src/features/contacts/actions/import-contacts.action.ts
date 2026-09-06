"use server"

import { importService } from "@chatbotx.io/business"
import { getAuditActor } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import {
  buildContactImportMeta,
  type ImportContactsRequest,
  type ImportContactsResponse,
  importContactsRequest,
} from "@/features/contacts/schema/contact-import"
import { getCurrentUser } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const importContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importContactsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ImportContactsRequest
    }): Promise<ImportContactsResponse> => {
      const user = await getCurrentUser()
      if (!user) {
        return returnValidationErrors(importContactsRequest, {
          _errors: ["Unauthorized"],
        })
      }

      try {
        const actor = getAuditActor()
        return await importService.startContactImport({
          workspaceId,
          userId: user.id,
          inboxId: parsedInput.inboxId,
          fileId: parsedInput.fileId,
          meta: buildContactImportMeta(parsedInput),
          actor: { ipAddress: actor?.ipAddress, userAgent: actor?.userAgent },
        })
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (
            [
              "contactImportFileNotFound",
              "contactImportFileTypeInvalid",
              "contactImportUnsupportedFormat",
            ].includes(error.code)
          ) {
            returnValidationErrors(importContactsRequest, {
              fileId: { _errors: [error.message] },
            })
          }
          if (error.code === "contactImportInboxNotFound") {
            returnValidationErrors(importContactsRequest, {
              inboxId: { _errors: [error.message] },
            })
          }
          if (error.code === "contactImportAlreadyRunning") {
            returnValidationErrors(importContactsRequest, {
              _errors: [error.message],
            })
          }
        }
        throw error
      }
    },
  )
