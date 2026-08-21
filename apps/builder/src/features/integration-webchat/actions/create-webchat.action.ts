"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { ensureBrandingMenuEntry } from "@chatbotx.io/business/branding"
import { db } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
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

    await db.transaction(async (tx) => {
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
      }

      const webchatId = createId()
      const { inbox } = await inboxService.create({
        tx,
        ownerId,
        data: {
          id: webchatId,
          workspaceId,
          channel: "webchat",
          name: rest.name,
          sourceId: webchatId,
        },
      })

      await tx.insert(integrationWebchatModel).values({
        ...rest,
        persistentMenus,
        id: webchatId,
        authorizedDomains: authorizedDomains.map((domain) => domain.value),
        workspaceId,
        inboxId: inbox.id,
        auth: {},
      })
    })

    return {
      workspaceId,
    }
  })
