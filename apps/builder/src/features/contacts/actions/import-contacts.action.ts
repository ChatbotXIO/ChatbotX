"use server"

import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ImportContactsRequest,
  importContactsRequest,
} from "../schemas/action"

export const importContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importContactsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: ImportContactsRequest
    }) => {
      // TODO
      console.log(JSON.stringify(parsedInput, null, 2))
      await Promise.resolve(parsedInput)

      revalidateCacheTags([
        `workspaces:${workspaceId}#contacts`,
        `workspaces:${workspaceId}#conversations`,
      ])
    },
  )
