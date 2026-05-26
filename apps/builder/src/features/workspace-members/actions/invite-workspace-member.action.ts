"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import { createId, SymbolicSnowflakeIDs } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"

export const inviteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(inviteWorkspaceMemberRequest)
  .action(async ({ ctx, parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    const invitation = await db
      .insert(invitationModel)
      .values({
        id: createId(),
        code: SymbolicSnowflakeIDs.generate(),
        role: parsedInput.role,
        permissions: parsedInput.permissions,
        expiresAt: addDays(new Date(), 1),
        workspaceId,
        organizationId: ctx.workspace.organizationId,
        invitedBy: ctx.user.id,
      })
      .returning()
      .then((result) => result[0])

    await logAudit({
      workspaceId,
      userId: ctx.user.id,
      action: auditLogActions.USER_INVITED,
      detail: `Convite enviado para ${parsedInput.email} como ${parsedInput.role === "manager" ? "Administrador" : "Representante"}`,
    })

    return invitation
  })
