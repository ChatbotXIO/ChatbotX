"use server"

import { prisma } from "@aha.chat/database"
import { InboxType } from "@aha.chat/database/types"
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

    await prisma.$transaction(async (tx) => {
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

      const inbox = await tx.inbox.create({
        data: {
          chatbotId,
          inboxType: InboxType.webchat,
          sourceId: createId(),
        },
      })
      await tx.integrationWebchat.create({
        data: {
          ...rest,
          authorizedDomains: authorizedDomains.map((domain) => domain.value),
          chatbotId,
          inboxId: inbox.id,
          auth: "{}",
        },
      })
    })

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)

    return {
      chatbotId,
    }
  })
