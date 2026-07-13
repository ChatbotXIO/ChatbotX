import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetReflinkRequest,
  ListReflinksRequest,
  ListReflinksResponse,
} from "../schemas/query"
import type { ReflinkResource } from "../schemas/resource"

export async function listReflinks(
  input: ListReflinksRequest,
): Promise<ListReflinksResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    type: "refLink" as const,
    ...(input.keyword ? { name: { ilike: likeContains(input.keyword) } } : {}),
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

export async function findReflink(
  where: GetReflinkRequest,
): Promise<ReflinkResource | undefined> {
  return await db.query.reflinkModel.findFirst({
    where: { ...where, type: "refLink" },
  })
}
