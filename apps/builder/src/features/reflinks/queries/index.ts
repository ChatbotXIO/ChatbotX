import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { reflinkModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListReflinksRequest,
  ListReflinksResponse,
} from "../schemas/query"
import type { ReflinkResource } from "../schemas/resource"

export async function listReflinks(
  input: ListReflinksRequest,
): Promise<ListReflinksResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    ...(input.keyword ? { name: { ilike: `%${input.keyword}%` } } : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(reflinkModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.reflinkModel.findMany({
      where,
      orderBy,
      ...pagination,
      with: {
        flow: true,
        customField: true,
      },
    }),
    db.$count(reflinkModel, relationsFilterToSQL(reflinkModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / input.perPage)

  return { data, pageCount }
}

export async function findReflink(where: {
  chatbotId: string
  id: string
}): Promise<ReflinkResource | undefined> {
  return await db.query.reflinkModel.findFirst({
    where,
  })
}
