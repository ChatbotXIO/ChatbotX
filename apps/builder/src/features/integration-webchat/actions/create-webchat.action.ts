"use server"

import { db } from "@chatbotx.io/database/client"
import {
  inboxModel,
  integrationWebchatModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { createWebchatRequest } from "../schema/mutation"

export const createWebchatAction = authActionClient
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { authorizedDomains, ...rest } = parsedInput

    let workspaceId = parsedInput.workspaceId
    const { organization } = await identifyChatbotAndOrganizationFromRequest(
      parsedInput.workspaceId,
    )

    await db.transaction(async (tx) => {
      if (!workspaceId) {
        const newChatbot = await createSimpleWorkspace(
          tx,
          ctx.user.id,
          organization,
          {
            name: parsedInput.name,
            timezone: "UTC",
            organizationId: organization.id,
          },
        )
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
