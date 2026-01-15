import { type Prisma, prisma } from "@aha.chat/database"
import type { WebhookModel, WebhookWhereInput } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { WebhookCollection } from "../schemas"
import type { GetWebhooksSchema } from "../schemas/get-webhook-schema"

export async function getWebhooks(
  input: GetWebhooksSchema,
): Promise<WebhookCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.WebhookWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId !== undefined) {
    where.folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
  }

  if (input.name) {
    where.AND = [
      {
        name: {
          contains: input.name,
          mode: "insensitive",
        },
      },
    ]
  }

  const orderBy = input.sort.map((sortItem) => {
    if ((sortItem.id as string) === "contacts") {
      return {
        contacts: {
          _count: sortItem.desc ? "desc" : "asc",
        },
      } as Prisma.WebhookOrderByWithRelationInput
    }
    return {
      [sortItem.id]: sortItem.desc ? "desc" : "asc",
    } as Prisma.WebhookOrderByWithRelationInput
  })

  const [data, total] = await prisma.$transaction([
    prisma.webhook.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
      include: {
        conditions: true,
      },
    }),
    prisma.webhook.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findWebhook(
  where: WebhookWhereInput,
): Promise<WebhookModel | null> {
  return await prisma.webhook.findFirst({
    where,
    include: {
      conditions: true,
    },
  })
}
