"use server"

import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateReflinkRequest,
  createReflinkRequest,
} from "../schemas/action"

export const createReflinkAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateReflinkRequest
    }) => {
      try {
        await db.insert(reflinkModel).values({
          id: createId(),
          workspaceId,
          ...parsedInput,
        })

        revalidateCacheTags(`workspaces:${workspaceId}#reflinks`)
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(createReflinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
