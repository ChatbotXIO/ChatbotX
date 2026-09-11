"use server"

import {
  hasWorkspaceAccess,
  integrationWebchatService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ensureBrandingMenuEntry } from "@chatbotx.io/business/branding"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isCommunity } from "@/env"
import { getTenantSettings } from "@/features/tenant/utils"
import { authActionClient } from "@/lib/safe-action"
import { BRANDING_TITLE, getBrandingUrl } from "../lib"
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

    // Community keeps the "Built with" branding entry; silently re-add it
    // (same precedent as moveBrandingMenuLast in the messenger action).
    const persistentMenus = isCommunity()
      ? ensureBrandingMenuEntry(rest.persistentMenus, {
          label: BRANDING_TITLE,
          url: getBrandingUrl("webchat", (await getTenantSettings()).appUrl),
        })
      : rest.persistentMenus

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

    await auditService.record({
      workspaceId: result.workspaceId,
      action: "connect",
      detail: `connected a new Webchat channel (#${result.webchatId})`,
    })

    return {
      workspaceId: result.workspaceId,
    }
  })
