import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/enums"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { notFoundException } from "@/lib/errors/exception"
import type { ListAutomatedResponsesRequest } from "../schemas/query"
import type { AutomatedResponseResource } from "../schemas/resource"

export async function listAutomatedResponses(
  input: ListAutomatedResponsesRequest,
): Promise<PaginatedResponse<AutomatedResponseResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    userMessages: input.keyword
      ? { ilike: `%${input.keyword.toLowerCase()}%` }
      : undefined,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(automatedResponseModel, input)

  const [data, total] = await Promise.all([
    db.query.automatedResponseModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(
      automatedResponseModel,
      relationsFilterToSQL(automatedResponseModel, where),
    ),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export const findAutomatedResponse = async (input: {
  chatbotId: string
  id: string
}): Promise<AutomatedResponseModel | undefined> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await db.query.automatedResponseModel.findFirst({
    where: {
      chatbotId: input.chatbotId,
      id: input.id,
    },
  })
}

export const findAutomatedResponseOrFail = async (input: {
  chatbotId: string
  id: string
}): Promise<AutomatedResponseModel> => {
  const automatedResponse = await findAutomatedResponse(input)
  if (!automatedResponse) {
    throw notFoundException("Automated response not found")
  }
  return automatedResponse
}
