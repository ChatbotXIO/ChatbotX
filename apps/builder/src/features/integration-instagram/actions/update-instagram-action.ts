"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateInstagram } from "../lib/update-instagram-settings"
import {
  type UpdateInstagramRequest,
  updateInstagramRequest,
} from "../schema/action"

export const updateInstagramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateInstagramRequest)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [_workspaceId, id],
    }: {
      ctx: { workspace: WorkspaceModel }
      parsedInput: UpdateInstagramRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await updateInstagram({ workspaceId: ctx.workspace.id, id }, parsedInput)
    },
  )
