"use server"

import { decisionProfileService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import { decisionProfileActionSchema } from "../schema/action"

const updateDecisionProfileSchema = decisionProfileActionSchema.extend({
  id: z.string().regex(/^\d+$/),
})

export const updateDecisionProfileAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateDecisionProfileSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: typeof updateDecisionProfileSchema._output
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await requireWorkspacePermission(workspaceId, "superAdmin")

      return await decisionProfileService.update({
        ...parsedInput,
        workspaceId,
      })
    },
  )
