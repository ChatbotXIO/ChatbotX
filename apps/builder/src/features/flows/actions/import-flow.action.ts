"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import {
  fileContextTypes,
  fileStatuses,
  importTypes,
} from "@chatbotx.io/database/partials"
import { fileModel, importModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { getCurrentUser } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ImportFlowRequest,
  type ImportFlowResponse,
  importFlowRequest,
} from "../schemas/action"

export const importFlowAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importFlowRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ImportFlowRequest
    }): Promise<ImportFlowResponse> => {
      const user = await getCurrentUser()
      if (!user) {
        return returnValidationErrors(importFlowRequest, {
          _errors: ["Unauthorized"],
        })
      }

      const file = await db.query.fileModel.findFirst({
        where: { id: parsedInput.fileId, workspaceId },
      })
      if (!file) {
        return returnValidationErrors(importFlowRequest, {
          fileId: { _errors: ["File not found"] },
        })
      }
      if (
        file.contextType !== fileContextTypes.enum.import ||
        file.subType !== importTypes.enum.flow
      ) {
        return returnValidationErrors(importFlowRequest, {
          fileId: { _errors: ["File is not a flow import"] },
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
          userId: user.id,
          fileId: file.id,
          type: importTypes.enum.flow,
          format: "json",
          status: "pending",
          meta: {},
        })
      })

      await defaultQueue.add(DefaultJobAction.runImport, {
        type: DefaultJobAction.runImport,
        data: { importId },
      })

      return { importId }
    },
  )
