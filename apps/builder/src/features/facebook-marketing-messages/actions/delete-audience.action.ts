"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { deleteAudience } from "../lib/audience-operations"
import { deleteAudienceSchema } from "../schema/audience"

export const deleteAudienceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteAudienceSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { workspace: WorkspaceModel }
      parsedInput: { id: string }
    }) => {
      await deleteAudience({ workspace: ctx.workspace, id: parsedInput.id })
    },
  )
