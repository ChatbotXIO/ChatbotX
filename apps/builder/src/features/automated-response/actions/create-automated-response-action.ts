"use server"

import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { flowService } from "@/features/flows/flow.service"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { automatedResponseService } from "../automated-response.service"
import { createAutomatedResponseRequest } from "../schema/action"

export const createAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    if (parsedInput.folderId) {
      await ensureFolderIsExists(
        parsedInput.folderId,
        workspaceId,
        "automatedResponse",
      )
    }

    let flowId: string | undefined = parsedInput.flowId ?? undefined
    let text: string | null | undefined = parsedInput.text

    if (flowId) {
      const exists = await flowService.exists(workspaceId, flowId)
      if (!exists) {
        return returnValidationErrors(createAutomatedResponseRequest, {
          _errors: ["Validation Exception"],
          flowId: {
            _errors: ["Flow not found"],
          },
        })
      }
      text = undefined
    } else if (text) {
      flowId = undefined
    }

    await automatedResponseService.create(workspaceId, {
      text,
      flowId,
      folderId: parsedInput.folderId,
      keywords: parsedInput.keywords.map((m) => m.value),
    })
  })
