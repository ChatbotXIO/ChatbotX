"use server"

import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateWhatsappProfileRequest } from "../schemas/update-whatsapp-profile.request"

export const updateWhatsappProfileAction = chatbotActionClient
  .inputSchema(updateWhatsappProfileRequest)
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(async () => {
    return await {
      success: true,
    }
  })
