"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAudience } from "../lib/audience-operations"
import {
  type CreateAudienceInput,
  createAudienceSchema,
} from "../schema/audience"

export const createAudienceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAudienceSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { workspace: WorkspaceModel }
      parsedInput: CreateAudienceInput
    }) =>
      await createAudience({ workspace: ctx.workspace, input: parsedInput }),
  )
