"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import {
  type ContactImportMeta,
  fileContextTypes,
  fileStatuses,
  importTypes,
} from "@chatbotx.io/database/partials"
import { fileModel, importModel } from "@chatbotx.io/database/schema"
import { getImportEntry, inferImportFormat } from "@chatbotx.io/imports"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type ImportContactsRequest,
  type ImportContactsResponse,
  importContactsRequest,
} from "@/features/contacts/schemas/contact-import"
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

      const file = await db.query.fileModel.findFirst({
        where: { id: parsedInput.fileId, workspaceId },
      })
      if (!file) {
        return returnValidationErrors(importContactsRequest, {
          fileId: { _errors: ["File not found"] },
        })
      }
      if (
        file.contextType !== fileContextTypes.enum.import ||
        file.subType !== importTypes.enum.contacts
      ) {
        return returnValidationErrors(importContactsRequest, {
          fileId: { _errors: ["File is not a contacts import"] },
        })
      }

      const format = inferImportFormat({
        mimeType: file.mimeType,
        fileName: file.fileName,
      })
      const contactsConfig = getImportEntry(importTypes.enum.contacts).config
      if (!(format && contactsConfig.acceptedFormats.includes(format))) {
        return returnValidationErrors(importContactsRequest, {
          fileId: { _errors: ["Unsupported file format"] },
        })
      }

      const inbox = await db.query.inboxModel.findFirst({
        where: { id: parsedInput.inboxId, workspaceId },
      })

      if (!inbox) {
        return returnValidationErrors(importContactsRequest, {
          inboxId: { _errors: ["Inbox not found"] },
        })
      }

      const meta: ContactImportMeta = {
        channel: parsedInput.channel,
        countryCode: parsedInput.countryCode,
        columnMap: {
          contactId: parsedInput.contactId,
          phoneNumber: parsedInput.phoneNumber,
          email: parsedInput.email,
          firstName: parsedInput.firstName,
          lastName: parsedInput.lastName,
        },
        fieldMapping: parsedInput.fieldMapping?.filter(
          (mapping) => mapping.column && mapping.customFieldId,
        ),
        tagId: parsedInput.tagId || undefined,
      }

      // M-1: Prevent multiple concurrent imports for the same workspace. A user
      // rapidly submitting several files could cause overlapping quota races.
      const activeImport = await db.query.importModel.findFirst({
        where: {
          workspaceId,
          type: importTypes.enum.contacts,
          OR: [{ status: "pending" }, { status: "processing" }],
        },
        columns: { id: true },
      })
      if (activeImport) {
        return returnValidationErrors(importContactsRequest, {
          _errors: [
            "An import is already in progress for this workspace. Please wait for it to complete.",
          ],
        })
      }

      const importId = createId()

      // Mark the file uploaded and create the import row atomically so the
      // queued job can never reference an import row that failed to persist.
      await db.transaction(async (tx) => {
        await tx
          .update(fileModel)
          .set({
            status: fileStatuses.enum.uploaded,
            uploadedAt: new Date(),
          })
          .where(
            and(
              eq(fileModel.id, file.id),
              eq(fileModel.workspaceId, workspaceId),
            ),
          )

        await tx.insert(importModel).values({
          id: importId,
          workspaceId,
          inboxId: parsedInput.inboxId,
          userId: user.id,
          fileId: file.id,
          type: importTypes.enum.contacts,
          format,
          status: "pending",
          meta,
        })
      })

      await defaultQueue.add(DefaultJobAction.runImport, {
        type: DefaultJobAction.runImport,
        data: { importId },
      })

      return { importId }
    },
  )
