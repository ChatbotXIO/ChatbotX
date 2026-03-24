"use server"

import { db } from "@aha.chat/database/client"
import { inboxModel, integrationWebchatModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { createSimpleChatbot } from "@/features/chatbot/actions/create-chatbot-action"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { createWebchatRequest } from "../schemas/webchat.schema"

export const createWebchatAction = authActionClient
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, ctx }) => {
    const { authorizedDomains, ...rest } = parsedInput

    let chatbotId = parsedInput.chatbotId
    const { organization } = await identifyChatbotAndOrganizationFromRequest(
      parsedInput.chatbotId,
    )

    await db.transaction(async (tx) => {
      if (!chatbotId) {
        const newChatbot = await createSimpleChatbot(
          tx,
          ctx.user.id,
          organization,
          {
            name: parsedInput.name,
            accountTimezone: "UTC",
            organizationId: organization.id,
          },
        )
        chatbotId = newChatbot.id
      }

      const webchatId = createId()
      const inbox = await tx
        .insert(inboxModel)
        .values({
          id: webchatId,
          chatbotId: chatbotId as string,
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
        chatbotId: chatbotId as string,
        inboxId: inbox.id,
        auth: "{}",
      })
    })

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)

    return {
      chatbotId,
    }
  })
