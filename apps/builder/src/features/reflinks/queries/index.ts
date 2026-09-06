import { reflinkService } from "@chatbotx.io/business"
import { reflinkRepository } from "@chatbotx.io/database/repositories"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetReflinkRequest,
  ListReflinksRequest,
  ListReflinksResponse,
} from "../schema/query"
import type { ReflinkResource } from "../schema/resource"

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

  const [data, totalRows] = await Promise.all([
    reflinkRepository.listWithRelations({
      where,
      limit: pagination.limit,
      offset: pagination.offset,
      sort: input.sort,
    }),
    reflinkRepository.count({ where }),
  ])

  const pageCount = Math.ceil(totalRows / input.perPage)

  return { data, pageCount }
}

export async function findReflink(
  where: GetReflinkRequest,
): Promise<ReflinkResource | undefined> {
  return await reflinkService.findRefLink({
    workspaceId: where.workspaceId,
    id: where.id,
  })
}
