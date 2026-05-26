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
import { organizationMemberService } from "@/features/organization-members/services"
import { orgAdminActionClient } from "@/lib/safe-action"
import { deleteOrganizationUserSchema } from "../schema/upsert"

export const deleteOrganizationUserAction = orgAdminActionClient
  .inputSchema(deleteOrganizationUserSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { userId } = parsedInput

    if (userId === ctx.user.id) {
      throw new ChatbotXException("Você não pode remover a si mesmo.")
    }

    const orgMember = await db.query.organizationMemberModel.findFirst({
      where: { organizationId: ctx.organization.id, userId },
    })
    if (!orgMember) {
      throw new ChatbotXException("Usuário não pertence a esta organização.")
    }

    if (orgMember.role === "owner") {
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

    const wsMembers = await db.query.workspaceMemberModel.findMany({
      where: { userId },
      with: { workspace: { columns: { id: true, organizationId: true } } },
    })
    const wsMembersInOrg = wsMembers.filter(
      (m) => m.workspace?.organizationId === ctx.organization.id,
    )
    const wsIdsInOrg = wsMembersInOrg.map((m) => m.workspaceId)

    await db.transaction(async (tx) => {
      if (wsIdsInOrg.length > 0) {
        await tx
          .delete(workspaceMemberModel)
          .where(
            and(
              eq(workspaceMemberModel.userId, userId),
              inArray(workspaceMemberModel.workspaceId, wsIdsInOrg),
            ),
          )
      }
      await tx
        .delete(organizationMemberModel)
        .where(eq(organizationMemberModel.id, orgMember.id))

      const fallbackWorkspaceId =
        wsIdsInOrg[0] ??
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
          action: auditLogActions.USER_REVOKED,
          detail: `Usuário ${userId} removido da organização (revogado em ${wsIdsInOrg.length} workspace(s))`,
        })
      }
    })

    await organizationMemberService.invalidateForOrganization(
      ctx.organization.id,
    )
  })
