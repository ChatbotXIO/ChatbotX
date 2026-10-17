"use server"

import { decisionConnectionService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type DecisionConnectionAction,
  decisionConnectionActionSchema,
} from "../schema/action"

const inputSchema = decisionConnectionActionSchema.extend({
  id: z.string().regex(/^\d+$/),
})

export const updateDecisionConnectionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: DecisionConnectionAction & { id: string }
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await requireWorkspacePermission(workspaceId, "superAdmin")
      return await decisionConnectionService.update({
        ...parsedInput,
        workspaceId,
      })
    },
  )
