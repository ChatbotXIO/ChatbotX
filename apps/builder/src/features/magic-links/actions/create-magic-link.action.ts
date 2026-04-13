"use server"

import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { magicLinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateMagicLinkRequest,
  createMagicLinkRequest,
} from "../schemas/action"

export const createMagicLinkAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMagicLinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateMagicLinkRequest
    }) => {
      try {
        await db.insert(magicLinkModel).values({
          id: createId(),
          workspaceId,
          ...parsedInput,
        })

        revalidateCacheTags(`workspaces:${workspaceId}#magic-links`)
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(createMagicLinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
