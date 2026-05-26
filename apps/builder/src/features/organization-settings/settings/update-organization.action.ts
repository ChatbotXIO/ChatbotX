"use server"

import {
  auditLogActions,
  logAudit,
  organizationService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { OrganizationModel, UserModel } from "@chatbotx.io/database/types"
import { orgAdminActionClient } from "@/lib/safe-action"
import {
  type UpdateOrganizationSchema,
  updateOrganizationSchema,
} from "./schema"

export const updateOrganizationAction = orgAdminActionClient
  .inputSchema(updateOrganizationSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel; user: UserModel }
      parsedInput: UpdateOrganizationSchema
    }) => {
      const {
        logo: { url },
        ...rest
      } = parsedInput

      const changes: string[] = []
      if (rest.name !== ctx.organization.name) {
        changes.push(`name: "${ctx.organization.name}" → "${rest.name}"`)
      }
      if (url !== (ctx.organization.logo ?? "")) {
        changes.push("logo updated")
      }

      await organizationService.update({
        id: ctx.organization.id,
        data: {
          ...rest,
          logo: url,
        },
      })

      if (changes.length > 0) {
        const fallbackWorkspaceId = (
          await db.query.workspaceModel.findFirst({
            where: { organizationId: ctx.organization.id },
            columns: { id: true },
          })
        )?.id
        if (fallbackWorkspaceId) {
          await logAudit({
            workspaceId: fallbackWorkspaceId,
            userId: ctx.user.id,
            action: auditLogActions.WORKSPACE_UPDATED,
            detail: `Organização atualizada: ${changes.join(", ")}`,
          })
        }
      }
    },
  )
