"use server"

import {
  auditLogActions,
  logAudit,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { orgAdminActionClient } from "@/lib/safe-action"
import { deleteWorkspaceRequest } from "../schema/delete-workspace"

export const deleteWorkspaceAction = orgAdminActionClient
  .inputSchema(deleteWorkspaceRequest)
  .action(async ({ ctx, parsedInput }) => {
    const { organization, user } = ctx

    const workspace = await workspaceService.findOrFail({
      where: { id: parsedInput.id, organizationId: organization.id },
    })

    if (
      parsedInput.confirmName.trim().toLowerCase() !==
      workspace.name.trim().toLowerCase()
    ) {
      throw new ChatbotXException(
        "Nome digitado não confere com o nome do workspace.",
      )
    }

    await db.transaction(async (tx) => {
      await workspaceService.delete({ id: workspace.id, tx })
    })

    await logAudit({
      workspaceId: workspace.id,
      userId: user.id,
      action: auditLogActions.WORKSPACE_DELETED,
      detail: `Workspace "${workspace.name}" excluído`,
    })

    return { id: workspace.id, name: workspace.name }
  })
