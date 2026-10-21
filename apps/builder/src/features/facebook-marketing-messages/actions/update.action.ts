"use server"

import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateMarketingMessage } from "../lib/campaign-operations"
import {
  type UpdateMarketingMessageInput,
  updateMarketingMessageSchema,
} from "../schema/resource"

export const updateMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMarketingMessageSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [, id],
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateMarketingMessageInput
    }) =>
      await updateMarketingMessage({
        workspace: ctx.workspace,
        id,
        input: parsedInput,
      }),
  )
