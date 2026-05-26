"use server"

import {
  auditLogActions,
  ChatbotXException,
  logAudit,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  organizationMemberModel,
  userModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { organizationMemberService } from "@/features/organization-members/services"
import { orgAdminActionClient } from "@/lib/safe-action"
import { upsertOrganizationUserSchema } from "../schema/upsert"

const defaultPermissions = {
  restrictDataExport: false,
  restrictContactDeletion: false,
  restrictWorkspaceSettings: false,
  restrictIntegrationSettings: false,
  contactVisibility: "all" as const,
  restrictCalling: false,
  restrictWorkflows: false,
  maskPhoneAndEmail: false,
}

export const createOrganizationUserAction = orgAdminActionClient
  .inputSchema(upsertOrganizationUserSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { email, name, organizationRole, workspaceAssignments } = parsedInput

    if (organizationRole === "owner" && ctx.callerMember.role !== "owner") {
      throw new ChatbotXException(
        "Apenas proprietários podem atribuir o papel de Proprietário.",
      )
    }

    await db.transaction(async (tx) => {
      const existing = await tx.query.userModel.findFirst({
        where: { email },
      })

      let userId = existing?.id
      if (existing) {
        const alreadyInOrg = await tx.query.organizationMemberModel.findFirst({
          where: { organizationId: ctx.organization.id, userId: existing.id },
        })
        if (alreadyInOrg) {
          throw new ChatbotXException(
            "Este e-mail já pertence a um usuário da organização.",
          )
        }
      } else {
        const created = await tx
          .insert(userModel)
          .values({
            email,
            name: name || email,
            emailVerified: false,
          })
          .returning({ id: userModel.id })
        userId = created[0]?.id
      }
      if (!userId) {
        throw new ChatbotXException("Falha ao criar usuário.")
      }

      await tx.insert(organizationMemberModel).values({
        id: createId(),
        organizationId: ctx.organization.id,
        userId,
        role: organizationRole,
      })

      for (const assignment of workspaceAssignments) {
        await tx.insert(workspaceMemberModel).values({
          id: createId(),
          workspaceId: assignment.workspaceId,
          userId,
          role: assignment.role,
          permissions: defaultPermissions,
          notificationChannels: {
            messenger: true,
            email: true,
            telegram: true,
            browser: true,
          },
        })
      }

      const fallbackWorkspaceId =
        workspaceAssignments[0]?.workspaceId ??
        (
          await tx.query.workspaceModel.findFirst({
            where: { organizationId: ctx.organization.id },
            columns: { id: true },
          })
        )?.id
      if (fallbackWorkspaceId) {
        await logAudit({
          tx,
          workspaceId: fallbackWorkspaceId,
          userId: ctx.user.id,
          action: auditLogActions.USER_INVITED,
          detail: `Usuário ${email} adicionado como ${organizationRole} com acesso a ${workspaceAssignments.length} workspace(s)`,
        })
      }
    })

    await organizationMemberService.invalidateForOrganization(
      ctx.organization.id,
    )
  })
