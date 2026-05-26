"use server"

import {
  auditLogActions,
  ChatbotXException,
  logAudit,
} from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  organizationMemberModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { organizationMemberService } from "@/features/organization-members/services"
import { orgAdminActionClient } from "@/lib/safe-action"
import { editOrganizationUserSchema } from "../schema/upsert"

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

export const updateOrganizationUserAction = orgAdminActionClient
  .inputSchema(editOrganizationUserSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { userId, organizationRole, workspaceAssignments } = parsedInput

    const orgMember = await db.query.organizationMemberModel.findFirst({
      where: { organizationId: ctx.organization.id, userId },
    })
    if (!orgMember) {
      throw new ChatbotXException("Usuário não pertence a esta organização.")
    }

    if (
      userId === ctx.user.id &&
      orgMember.role === "owner" &&
      organizationRole !== "owner"
    ) {
      throw new ChatbotXException(
        "Você não pode rebaixar a si mesmo como Proprietário.",
      )
    }

    if (
      organizationRole === "owner" &&
      orgMember.role !== "owner" &&
      ctx.callerMember.role !== "owner"
    ) {
      throw new ChatbotXException(
        "Apenas proprietários podem atribuir o papel de Proprietário.",
      )
    }

    if (orgMember.role === "owner" && organizationRole !== "owner") {
      const otherOwners = await db.query.organizationMemberModel.findMany({
        where: {
          organizationId: ctx.organization.id,
          role: "owner",
          NOT: { userId },
        },
        columns: { id: true },
      })
      if (otherOwners.length === 0) {
        throw new ChatbotXException(
          "A organização precisa ter pelo menos um Proprietário.",
        )
      }
    }

    const currentMembers = await db.query.workspaceMemberModel.findMany({
      where: { userId },
      with: { workspace: { columns: { organizationId: true } } },
    })
    const currentInOrg = currentMembers.filter(
      (m) => m.workspace?.organizationId === ctx.organization.id,
    )

    const desiredByWs = new Map(
      workspaceAssignments.map((a) => [a.workspaceId, a.role]),
    )
    const currentByWs = new Map(currentInOrg.map((m) => [m.workspaceId, m]))

    const toCreate = workspaceAssignments.filter(
      (a) => !currentByWs.has(a.workspaceId),
    )
    const toDelete = currentInOrg.filter((m) => !desiredByWs.has(m.workspaceId))
    const toUpdate = workspaceAssignments
      .map((a) => {
        const existing = currentByWs.get(a.workspaceId)
        if (!existing) {
          return null
        }
        if (existing.role === a.role) {
          return null
        }
        return {
          existingId: existing.id,
          role: a.role,
          workspaceId: a.workspaceId,
        }
      })
      .filter(Boolean) as Array<{
      existingId: string
      role: (typeof workspaceAssignments)[number]["role"]
      workspaceId: string
    }>

    await db.transaction(async (tx) => {
      if (orgMember.role !== organizationRole) {
        await tx
          .update(organizationMemberModel)
          .set({ role: organizationRole })
          .where(eq(organizationMemberModel.id, orgMember.id))
      }

      for (const a of toCreate) {
        await tx.insert(workspaceMemberModel).values({
          id: createId(),
          workspaceId: a.workspaceId,
          userId,
          role: a.role,
          permissions: defaultPermissions,
          notificationChannels: {
            messenger: true,
            email: true,
            telegram: true,
            browser: true,
          },
        })
      }

      for (const u of toUpdate) {
        await tx
          .update(workspaceMemberModel)
          .set({ role: u.role })
          .where(eq(workspaceMemberModel.id, u.existingId))
      }

      if (toDelete.length > 0) {
        await tx.delete(workspaceMemberModel).where(
          and(
            eq(workspaceMemberModel.userId, userId),
            inArray(
              workspaceMemberModel.workspaceId,
              toDelete.map((m) => m.workspaceId),
            ),
          ),
        )
      }

      const fallbackWorkspaceId =
        workspaceAssignments[0]?.workspaceId ??
        toDelete[0]?.workspaceId ??
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
          action: auditLogActions.USER_ROLE_UPDATED,
          detail: `Usuário ${userId} atualizado: role=${organizationRole}, +${toCreate.length}/-${toDelete.length}/~${toUpdate.length} workspaces`,
        })
      }
    })

    await organizationMemberService.invalidateForOrganization(
      ctx.organization.id,
    )
  })
