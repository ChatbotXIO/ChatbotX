"use server"

import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { GetWebchatRequest } from "../schemas/webchat.schema"

export async function getWebchats(parsedInputs: GetWebchatRequest) {
  const currentUserId = await getCurrentUserId()
  await findChatbotOrFail(currentUserId, parsedInputs.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.IntegrationChatWidgetWhereInput = {
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
            const count = await tx.integrationChatWidget.count({ where })
            pageCount = Math.ceil(count / parsedInputs.perPage)

            pagination.skip =
              (parsedInputs.page ? parsedInputs.page - 1 : 0) *
              parsedInputs.perPage
            pagination.take = parsedInputs.perPage
          }

          const data = await prisma.integrationChatWidget.findMany({
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
    {
      revalidate: 3600,
      tags: [`chatbots:${parsedInputs.chatbotId}#webchats`],
    },
  )()
}
