"use server"

import { db } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
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

    // validate flow id if text is not provided
    if (parsedInput.text) {
      parsedInput.flowId = null
    } else if (parsedInput.flowId) {
      const exists = await db.query.flowModel.findFirst({
        columns: {
          id: true,
        },
        where: {
          id: parsedInput.flowId,
          workspaceId,
        },
      })
      if (!exists) {
        return returnValidationErrors(createAutomatedResponseRequest, {
          _errors: ["Validation Exception"],
          flowId: {
            _errors: ["Flow not found"],
          },
        })
      }
      parsedInput.text = null
    }

    await db.insert(automatedResponseModel).values({
      ...parsedInput,
      workspaceId,
      status: true,
      userMessages: parsedInput.userMessages.map((m) => m.value),
      id: createId(),
    })

    revalidateCacheTags(`workspaces:${workspaceId}#automatedResponses`)
  })
