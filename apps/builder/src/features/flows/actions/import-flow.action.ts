"use server"

import { importService } from "@chatbotx.io/business"
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

      const result = await importService.startFlowImport({
        workspaceId,
        userId: user.id,
        fileId: parsedInput.fileId,
        folderId: parsedInput.folderId,
      })
      if (!result.ok) {
        return returnValidationErrors(importFlowRequest, {
          fileId: {
            _errors: [
              result.reason === "fileNotFound"
                ? "File not found"
                : "File is not a flow import",
            ],
          },
        })
      }

      await defaultQueue.add(DefaultJobAction.runImport, {
        type: DefaultJobAction.runImport,
        data: { importId: result.importId },
      })

      return { importId: result.importId }
    },
  )
