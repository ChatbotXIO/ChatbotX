"use server"

import {
  hasWorkspaceAccess,
  integrationWebchatService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTenantSettings } from "@/features/tenant/utils"
import { authActionClient } from "@/lib/safe-action"
import { applyWebchatBranding } from "../lib"
import { createWebchatRequest } from "../schema/mutation"

export const createWebchatAction = authActionClient
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { authorizedDomains, ...rest } = parsedInput

    if (
      parsedInput.workspaceId &&
      !(await hasWorkspaceAccess({
        workspaceId: parsedInput.workspaceId,
        user: ctx.user,
      }))
    ) {
      throw new ChatbotXException("Workspace not found", "notFound", 404)
    }

    const persistentMenus = applyWebchatBranding(
      rest.persistentMenus,
      (await getTenantSettings()).appUrl,
    )

    const result = await integrationWebchatService.createWithWorkspace({
      workspaceId: parsedInput.workspaceId ?? undefined,
      createdBy: ctx.user.id,
      workspaceName: parsedInput.name,
      data: {
        ...rest,
        persistentMenus,
        authorizedDomains: authorizedDomains.map((domain) => domain.value),
        auth: {},
        customCss: rest.customCss ?? null,
      },
    })

    if (result.createdWorkspace) {
      await auditService.record({
        userId: ctx.user.id,
        workspaceId: result.workspaceId,
        action: "create",
        detail: `created the workspace (#${result.workspaceId})`,
      })
    }

    return {
      workspaceId: result.workspaceId,
    }
  })
