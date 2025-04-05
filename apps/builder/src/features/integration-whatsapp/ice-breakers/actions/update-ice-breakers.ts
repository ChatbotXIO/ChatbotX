"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { getLogger } from "@/lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import { integrations } from "@/integration"
import {
  type UpdateIceBreakerSchema,
  updateIceBreakerSchema,
} from "../schemas/update-ice-breaker-schema"

export const updateIceBreakerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(updateIceBreakerSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateIceBreakerSchema
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
        logger: getLogger("whatsapp"),
        uploader,
      }

      await integrations.WHATSAPP.integration.actions?.updateIceBreaker({
        ctx,
        prompts: parsedInput.prompts,
      })
    },
  )
