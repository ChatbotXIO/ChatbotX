"use server"

import { findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWhatsappIceBreakerSchema,
  updateWhatsappIceBreakerSchema,
} from "../schemas/update-ice-breaker-schema"

export const updateWhatsappIceBreakerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWhatsappIceBreakerSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateWhatsappIceBreakerSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp = await findOrFail({
        table: integrationWhatsappModel,
        where: {
          workspaceId,
        },
        message: "Integration Whatsapp not found",
      })

      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
        storagePrefix: getStoragePrefix(
          workspaceId,
          integrationWhatsapp.inboxId,
        ),
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
