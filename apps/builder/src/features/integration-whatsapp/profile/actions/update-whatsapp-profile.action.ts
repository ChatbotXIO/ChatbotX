"use server"

import { chatbotActionClient } from "@/lib/safe-action"
import {
  updateWhatsappProfileRequest,
  type UpdateWhatsappProfileRequest,
} from "../schemas/update-whatsapp-profile.request"
import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"

export const updateWhatsappProfileAction = chatbotActionClient
  .schema(updateWhatsappProfileRequest)
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateWhatsappProfileRequest
    }) => {
      console.log(chatbotId, parsedInput)
    },
  )
