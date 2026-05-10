"use server"

import { workspaceService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  inboxModel,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { identifyWorkspaceAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { createWebchatRequest } from "../schema/mutation"

export const createWebchatAction = authActionClient
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { authorizedDomains, ...rest } = parsedInput

    let workspaceId = parsedInput.workspaceId
    const { organization } = await identifyWorkspaceAndOrganizationFromRequest(
      parsedInput.workspaceId,
    )

    await db.transaction(async (tx) => {
      if (!workspaceId) {
        const newChatbot = await workspaceService.create({
          tx,
          createdBy: ctx.user.id,
          organization,
          data: {
            name: parsedInput.name,
            timezone: "UTC",
            organizationId: organization.id,
          },
        })
        workspaceId = newChatbot.id
      }

      const webchatId = createId()
      const inbox = await tx
        .insert(inboxModel)
        .values({
          id: webchatId,
          workspaceId,
          channel: "webchat",
          name: rest.name,
          sourceId: webchatId,
        })
        .returning()
        .then((result) => result[0])

      await tx.insert(integrationWebchatModel).values({
        ...rest,
        id: webchatId,
        authorizedDomains: authorizedDomains.map((domain) => domain.value),
        workspaceId,
        inboxId: inbox.id,
        auth: {},
      })
    })

    revalidateCacheTags(`workspaces:${workspaceId}#webchats`)

    return {
      workspaceId,
    }
  })
