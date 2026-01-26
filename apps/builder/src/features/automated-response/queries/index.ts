import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { rootFolderId } from "@aha.chat/database/enums"
import type {
  AutomatedResponseModel,
  AutomatedResponseWhereInput,
} from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAutomatedResponsesRequest } from "../schemas/get-automated-responses-schema"
import type { AutomatedResponseCollection } from "../schemas/types"

export async function getAutomatedResponses(
  input: ListAutomatedResponsesRequest,
): Promise<AutomatedResponseCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.AutomatedResponseWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.keyword) {
    where.userMessages = {
      has: input.keyword,
    }
  }
  if (input.folderId) {
    where.folderId = input.folderId === rootFolderId ? null : input.folderId
  }
  const orderBy = input.sort.map((sortItem) => ({
    [sortItem.id]: sortItem.desc ? "desc" : "asc",
  }))

  const [data, total] = await prisma.$transaction([
    prisma.automatedResponse.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
    }),
    prisma.automatedResponse.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findAutomatedResponse(
  where: AutomatedResponseWhereInput,
): Promise<AutomatedResponseModel | null> {
  return await prisma.automatedResponse.findFirst({
    where,
  })
}
