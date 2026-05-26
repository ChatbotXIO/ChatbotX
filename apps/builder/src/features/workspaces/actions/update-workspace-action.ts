"use server"

import {
  auditLogActions,
  logAudit,
  workspaceService,
} from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWorkspaceAdvancedRequest,
  type UpdateWorkspaceBasicRequest,
  updateWorkspaceAdvancedRequest,
  updateWorkspaceBasicRequest,
} from "../schema/update-workspace-schema"

export const updateWorkspaceBasicAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWorkspaceBasicRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      ctx,
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      ctx: { user: { id: string }; workspaceId: string; workspace: unknown }
      parsedInput: UpdateWorkspaceBasicRequest
    }) => {
      await workspaceService.update({
        id: workspaceId,
        data: parsedInput,
      })
      await logAudit({
        workspaceId,
        userId: ctx.user.id,
        action: auditLogActions.WORKSPACE_UPDATED,
        detail: `Workspace renomeado para "${parsedInput.name}"`,
      })
      revalidatePath("/space", "layout")
    },
  )

export const updateWorkspaceAdvancedAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWorkspaceAdvancedRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateWorkspaceAdvancedRequest
    }) => {
      await workspaceService.update({
        id: workspaceId,
        data: parsedInput,
      })
      revalidatePath("/space", "layout")
    },
  )
