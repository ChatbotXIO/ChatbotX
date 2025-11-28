"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { GetWebchatRequest } from "../schemas/webchat.schema"

export async function getIntegationWebchats(parsedInputs: GetWebchatRequest) {
  await assertCurrentUserCanAccessChatbot(parsedInputs.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.IntegrationWebchatWhereInput = {
          chatbotId: parsedInputs.chatbotId,
        }

        const orderBy = parsedInputs.sort
          ? parsedInputs.sort.map((sortItem) => ({
              [sortItem.id]: sortItem.desc ? "desc" : "asc",
            }))
          : [{ createdAt: "desc" }]

        return await prisma.$transaction(async (tx) => {
          let pageCount = 1
          const pagination: { skip?: number; take?: number } = {}

          if (parsedInputs.perPage) {
            const count = await tx.integrationWebchat.count({ where })
            pageCount = Math.ceil(count / parsedInputs.perPage)

            pagination.skip =
              (parsedInputs.page ? parsedInputs.page - 1 : 0) *
              parsedInputs.perPage
            pagination.take = parsedInputs.perPage
          }

          const data = await prisma.integrationWebchat.findMany({
            ...pagination,
            where,
            orderBy,
          })

          return { data, pageCount }
        })
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(parsedInputs)],
    calcCacheTags([`chatbots:${parsedInputs.chatbotId}#webchats`]),
  )()
}

export async function findIntegrationWebchat(
  where: Pick<IntegrationWebchatModel, "id" | "chatbotId">,
) {
  return await prisma.integrationWebchat.findFirstOrThrow({
    where,
  })
}
