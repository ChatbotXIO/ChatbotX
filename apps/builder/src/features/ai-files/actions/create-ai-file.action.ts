"use server"

import { aiFileService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toAIFileCreateActionError } from "../lib/create-error-message"
import { createAIFileRequest } from "../schema"

export const createAIFileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFileRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    try {
      const file = await aiFileService.create(workspaceId, parsedInput)
      return {
        id: file.id,
        processingRunError: file.processingRun?.error ?? null,
      }
    } catch (error) {
      // fileTooLarge / unsupportedFileType / uploadPathNotAllowed come from
      // the server-side check of the uploaded object.
      throw await toAIFileCreateActionError(error)
    }
  })
