"use server"

import {
  auditLogActions,
  logAudit,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { createId } from "@chatbotx.io/utils"
import { orgAdminActionClient } from "@/lib/safe-action"
import { createWorkspaceRequest } from "../schema/create-workspace"

export const createWorkspaceAction = orgAdminActionClient
  .inputSchema(createWorkspaceRequest)
  .action(async ({ ctx, parsedInput }) => {
    const { organization, user } = ctx
    if (!organization?.id) {
      throw new ChatbotXException("Organização não encontrada")
    }

    const workspace = await db.transaction(
      async (tx) =>
        await workspaceService.create({
          tx,
          organization,
          createdBy: user.id,
          data: {
            id: createId(),
            name: parsedInput.name,
            organizationId: organization.id,
          },
        }),
    )

    await logAudit({
      workspaceId: workspace.id,
      userId: user.id,
      action: auditLogActions.WORKSPACE_CREATED,
      detail: `Workspace "${workspace.name}" criado`,
    })

    return { id: workspace.id, name: workspace.name }
  })
