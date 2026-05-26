"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx,
    } = props

    const workspaceMember = await findOrFail({
      table: workspaceMemberModel,
      where: { id, workspaceId },
      message: "Workspace member not found",
    })

    const memberUser = await db.query.userModel.findFirst({
      where: { id: workspaceMember.userId },
      columns: { name: true, email: true },
    })

    if (workspaceMember.role === "owner") {
      throw new ChatbotXException(
        "Você não pode revogar o acesso do Proprietário.",
      )
    }

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "Você não tem permissão para revogar este usuário.",
      )
    }

    const currentRole = currentUserAndTargetChatbot.targetWorkspaceMember.role
    if (currentRole !== "owner" && currentRole !== "manager") {
      throw new ChatbotXException(
        "Apenas Proprietários e Administradores podem revogar usuários.",
      )
    }

    await db.delete(workspaceMemberModel).where(eq(workspaceMemberModel.id, id))

    const userName = memberUser?.name ?? memberUser?.email ?? "(desconhecido)"

    await logAudit({
      workspaceId,
      userId: ctx.user.id,
      action: auditLogActions.USER_REVOKED,
      detail: `Acesso revogado para ${userName} (era ${workspaceMember.role})`,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#workspaceMembers`)
  })
