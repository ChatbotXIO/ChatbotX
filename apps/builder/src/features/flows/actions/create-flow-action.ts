"use server"

import { flowService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateFlowSchema, createFlowSchema } from "../schema/action"

export const createFlowAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFlowSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFlowSchema
    }) =>
      await flowService.createWithDefaultDraft({
        ...parsedInput,
        workspaceId,
      }),
  )
