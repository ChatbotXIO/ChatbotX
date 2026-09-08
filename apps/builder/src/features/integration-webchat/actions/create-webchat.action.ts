"use server"

import {
  integrationWebchatService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ensureBrandingMenuEntry } from "@chatbotx.io/business/branding"
import { db } from "@chatbotx.io/database/client"
import { isCommunity } from "@/env"
import { getTenantSettings } from "@/features/tenant/utils"
import { authActionClient } from "@/lib/safe-action"
import { BRANDING_TITLE, getBrandingUrl } from "../lib"
import { createWebchatRequest } from "../schema/mutation"

export const createWebchatAction = authActionClient
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { authorizedDomains, ...rest } = parsedInput

    // Community keeps the "Built with" branding entry; silently re-add it
    // (same precedent as moveBrandingMenuLast in the messenger action).
    const persistentMenus = isCommunity()
      ? ensureBrandingMenuEntry(rest.persistentMenus, {
          label: BRANDING_TITLE,
          url: getBrandingUrl("webchat", (await getTenantSettings()).appUrl),
        })
      : rest.persistentMenus

    let workspaceId = parsedInput.workspaceId
    let ownerId = ctx.user.id

    const result = await db.transaction(async (tx) => {
      let createdWorkspace = false

      if (workspaceId) {
        const workspace = await workspaceService.findOrFail({
          where: { id: workspaceId },
        })
        ownerId = workspace.ownerId
      } else {
        const newChatbot = await workspaceService.create({
          tx,
          createdBy: ownerId,
          data: {
            name: parsedInput.name,
            timezone: "UTC",
            ownerId,
          },
        })
        workspaceId = newChatbot.id
        createdWorkspace = true
      }

      const created = await integrationWebchatService.create(
        {
          workspaceId,
          ownerId,
          data: {
            ...rest,
            persistentMenus,
            authorizedDomains: authorizedDomains.map((domain) => domain.value),
            auth: {},
            customCss: rest.customCss ?? null,
          },
        },
        tx,
      )

      return { workspaceId, createdWorkspace, webchatId: created.id }
    })

    if (result.createdWorkspace) {
      await auditService.record({
        userId: ctx.user.id,
        workspaceId: result.workspaceId as string,
        action: "create",
        detail: `created the workspace (#${result.workspaceId})`,
      })
    }

    await auditService.record({
      workspaceId: result.workspaceId as string,
      action: "connect",
      detail: `connected a new Webchat channel (#${result.webchatId})`,
    })

    return {
      workspaceId: result.workspaceId,
    }
  })
