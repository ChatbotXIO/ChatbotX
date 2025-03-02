"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import type { InputJsonValue } from "@prisma/client/runtime/binary"
import { revalidateTag } from "next/cache"

export const duplicateAITriggerAction = authActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
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
          questions: questions as InputJsonValue[],
        },
      })

      revalidateTag(`chatbot:${chatbotId}#aiTriggers`)
    },
  )
