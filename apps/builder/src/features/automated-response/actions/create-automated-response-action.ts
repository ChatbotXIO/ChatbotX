"use server"

import { automatedResponseService, folderService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  automatedResponseFolderTypeByType,
  automatedResponseTypes,
} from "@chatbotx.io/database/partials"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAutomatedResponseRequest } from "../schema/action"

export const createAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([...workspaceIdrequestParams, automatedResponseTypes])
  .inputSchema(createAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, type],
      parsedInput,
    } = props

    if (parsedInput.folderId) {
      await folderService.ensureExists({
        id: parsedInput.folderId,
        workspaceId,
        folderType: automatedResponseFolderTypeByType[type],
      })
    }

    try {
      await automatedResponseService.create(workspaceId, {
        type,
        text: parsedInput.text,
        flowId: parsedInput.flowId,
        folderId: parsedInput.folderId,
        keywords: parsedInput.keywords.map((m) => m.value),
      })
    } catch (error) {
      if (
        error instanceof ChatbotXException &&
        error.code === "validation" &&
        error.field
      ) {
        returnValidationErrors(createAutomatedResponseRequest, {
          _errors: ["Validation Exception"],
          [error.field]: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
