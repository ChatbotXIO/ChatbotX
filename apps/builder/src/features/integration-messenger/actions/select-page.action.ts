"use server"

import { IntegrationType, prisma } from "@aha.chat/database"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import { revalidateTag } from "next/cache"
import type { Prisma } from "node_modules/@aha.chat/database/src/generated/prisma/client"
import type { ChatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { saveAuthValueToCache } from "../queries/save-auth-value"
import { type SelectPageRequest, selectPageRequestSchema } from "../schemas"

export const selectPageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(selectPageRequestSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: SelectPageRequest
    }) => {
      try {
        const { pageId, pageName, pageAccessToken } = parsedInput
        const authResult = (await saveAuthValueToCache(
          chatbotId,
        )) as MessengerAuthValue

        await prisma.$transaction(async (tx) => {
          authResult.tokens.pageAccessToken = pageAccessToken
          authResult.metadata.pageName = pageName
          await tx.inbox.create({
            data: {
              chatbotId,
              inboxType: IntegrationType.MESSENGER,
              integrationMessenger: {
                create: {
                  chatbotId,
                  pageId,
                  auth: authResult as Prisma.InputJsonValue,
                },
              },
            },
          })
        })

        revalidateTag(`chatbots:${chatbotId}#messengerAuthValue`)
      } catch (_error) {
        throw new Error("Failed to select Facebook page")
      }
    },
  )
