"use server"

import { db } from "@chatbotx.io/database/client"
import { inboxModel, integrationEmailModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { createEmailRequest } from "../schema/mutation"

export const createEmailAction = authActionClient
  .inputSchema(createEmailRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { workspaceId: inputWorkspaceId, ...rest } = parsedInput

    let workspaceId = inputWorkspaceId
    const { organization } =
      await identifyChatbotAndOrganizationFromRequest(inputWorkspaceId)

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

      const emailId = createId()
      const inbox = await tx
        .insert(inboxModel)
        .values({
          id: emailId,
          workspaceId,
          channel: "email",
          name: rest.name,
          sourceId: emailId,
        })
        .returning()
        .then((result) => result[0])

      await tx.insert(integrationEmailModel).values({
        id: emailId,
        name: rest.name,
        provider: rest.provider,
        host: rest.host,
        port: rest.port,
        username: rest.username,
        password: rest.password,
        fromAddress: rest.fromAddress,
        workspaceId,
        inboxId: inbox.id,
        auth: {},
      })
    })

    revalidateCacheTags(`workspaces:${workspaceId}#emails`)

    return {
      workspaceId,
    }
  })
