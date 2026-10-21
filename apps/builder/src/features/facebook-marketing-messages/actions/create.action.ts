"use server"

import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMarketingMessage } from "../lib/campaign-operations"
import {
  type CreateMarketingMessageInput,
  createMarketingMessageSchema,
} from "../schema/resource"

export const createMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMarketingMessageSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      parsedInput: CreateMarketingMessageInput
    }) =>
      await createMarketingMessage({
        workspace: ctx.workspace,
        input: parsedInput,
      }),
  )
