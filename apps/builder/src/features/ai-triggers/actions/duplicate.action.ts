"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const duplicateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const {
        id: eid,
        name,
        createdAt,
        updatedAt,
        questions,
        ...rest
      } = await prisma.aITrigger.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.aITrigger.create({
        data: {
          ...rest,
          name: `${name} _copy`,
          questions: questions as Prisma.InputJsonValue[],
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
