"use server"

import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateReflinkRequest
    }) => {
      try {
        await db.insert(reflinkModel).values({
          id: createId(),
          workspaceId,
          type: "refLink",
          ...parsedInput,
        })
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
