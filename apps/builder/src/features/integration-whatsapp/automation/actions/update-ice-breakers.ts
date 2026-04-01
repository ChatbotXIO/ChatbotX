"use server"

import { findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
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
      const integrationWhatsapp = await findOrFail(
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
