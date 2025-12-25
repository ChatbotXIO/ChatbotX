"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type FilterContactRequest,
  filterContactRequest,
} from "../schemas/action"

export const filterContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(filterContactRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: FilterContactRequest
    }) => {
      // TODO
      console.log(JSON.stringify(parsedInput, null, 2))
      await Promise.resolve(parsedInput)

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])
    },
  )
