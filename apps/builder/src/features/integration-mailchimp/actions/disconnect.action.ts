"use server"

import { prisma } from "@aha.chat/database"
import {
  integration as integrationMailchimp,
  mailchimpAuthValueSchema,
} from "@aha.chat/integration-mailchimp"
import { revalidatePath } from "next/cache"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectMailchimp = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ ctx }) => {
    const { chatbot } = ctx

    const mailchimp = await prisma.integrationMailchimp.findFirst({
      where: { chatbotId: chatbot.id },
    })

    if (!mailchimp) {
      return { success: true }
    }

    try {
      if (integrationMailchimp.disconnect) {
        await integrationMailchimp.disconnect(
          mailchimpAuthValueSchema.parse(mailchimp.auth),
        )
      }
    } catch (_error) {
      // Silently fail if external disconnect logic fails
    }

    await prisma.integration.delete({
      where: {
        id: mailchimp.integrationId,
      },
    })

    revalidatePath(`/chatbots/${chatbot.id}/settings/integrations`)

    return { success: true }
  })
