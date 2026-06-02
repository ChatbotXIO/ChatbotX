"use server"

import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
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
      bindArgsParsedInputs: [_workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ImportContactsRequest
    }) => {
      // TODO
      console.log(JSON.stringify(parsedInput, null, 2))
      await Promise.resolve(parsedInput)
    },
  )
