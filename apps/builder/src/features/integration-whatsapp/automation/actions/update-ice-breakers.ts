"use server"

import { findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
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
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateWhatsappIceBreakerSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateWhatsappIceBreakerSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
        integrationWhatsappModel,
        {
          chatbotId,
        },
        "Integration Whatsapp not found",
      )

      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
      }

      await integrations.whatsapp.runAction("updateConversationalAutomation", {
        ctx,
        data: {
          prompts: parsedInput.prompts.map((obj) => obj.value),
          enable_welcome_message: false,
          commands: [],
        },
      })
    },
  )
