"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWorkspaceMemberRequest } from "../schema/mutation"

export const updateWorkspaceMemberAction = workspaceActionClient
  .inputSchema(updateWorkspaceMemberRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id], ctx, parsedInput }) => {
      const workspaceMember = await findOrFail({
        table: workspaceMemberModel,
        where: { id, workspaceId },
        message: "Workspace member not found",
      })

      const memberUser = await db.query.userModel.findFirst({
        where: { id: workspaceMember.userId },
        columns: { name: true, email: true },
      })

      const currentUserAndTargetChatbot =
        await getCurrentUserAndTargetWorkspace(workspaceId)
      if (!currentUserAndTargetChatbot) {
        throw new ChatbotXException(
          "Você não tem permissão para atualizar este usuário.",
        )
      }

      const currentRole = currentUserAndTargetChatbot.targetWorkspaceMember.role
      if (currentRole !== "owner" && currentRole !== "manager") {
        throw new ChatbotXException(
          "Apenas Proprietários e Administradores podem editar usuários.",
        )
      }

      if (currentRole === "manager" && workspaceMember.role === "owner") {
        throw new ChatbotXException(
          "Administradores não podem editar o Proprietário.",
        )
      }

      const patch: Partial<typeof workspaceMemberModel.$inferInsert> = {
        role: parsedInput.role,
        permissions: parsedInput.permissions,
      }
      if (parsedInput.notificationTypes) {
        patch.notificationTypes = parsedInput.notificationTypes
      }
      if (parsedInput.notificationChannels) {
        patch.notificationChannels = parsedInput.notificationChannels
      }

      await db
        .update(workspaceMemberModel)
        .set(patch)
        .where(eq(workspaceMemberModel.id, workspaceMember.id))

      const userName = memberUser?.name ?? memberUser?.email ?? "(desconhecido)"
      const changes: string[] = []
      if (workspaceMember.role !== parsedInput.role) {
        changes.push(`nível: ${workspaceMember.role} → ${parsedInput.role}`)
      }
      changes.push("restrições atualizadas")

      await logAudit({
        workspaceId,
        userId: ctx.user.id,
        action:
          workspaceMember.role === parsedInput.role
            ? auditLogActions.USER_PERMISSIONS_UPDATED
            : auditLogActions.USER_ROLE_UPDATED,
        detail: `Usuário ${userName}: ${changes.join(", ")}`,
      })

      revalidateCacheTags(`workspaces:${workspaceId}#workspaceMembers`)
    },
  )
