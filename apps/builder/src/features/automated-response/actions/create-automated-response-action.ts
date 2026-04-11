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

    let flowId: string | undefined = parsedInput.flowId ?? undefined

    // validate flow id if provided
    if (flowId) {
      const exists = await db.query.flowModel.findFirst({
        columns: {
          id: true,
        },
        where: {
          id: flowId,
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

      parsedInput.text = undefined
    } else if (parsedInput.text) {
      flowId = undefined
    }

    await db.insert(automatedResponseModel).values({
      text: parsedInput.text,
      flowId,
      folderId: parsedInput.folderId,
      workspaceId,
      status: true,
      keywords: parsedInput.keywords.map((m) => m.value),
      id: createId(),
    })

    revalidateCacheTags(`workspaces:${workspaceId}#automatedResponses`)
  })
