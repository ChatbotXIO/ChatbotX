"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateWhatsappIceBreakerSchema,
  updateWhatsappIceBreakerSchema,
} from "../schemas/update-ice-breaker-schema"

export const updateWhatsappIceBreakerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(updateWhatsappIceBreakerSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateWhatsappIceBreakerSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp =
        await prisma.integrationWhatsapp.findFirstOrThrow({
          where: {
            chatbotId,
          },
        })
      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
      }

      await integrations.WHATSAPP.runAction("updateConversationalAutomation", {
        ctx,
        data: {
          prompts: parsedInput.prompts.map((obj) => obj.value),
          enable_welcome_message: false,
          commands: [],
        },
      })
    },
  )
