import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { magicLinkModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListMagicLinksRequest,
  ListMagicLinksResponse,
} from "../schemas/query"

export async function listMagicLinks(
  input: ListMagicLinksRequest,
): Promise<ListMagicLinksResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { name: { ilike: `%${input.keyword}%` } },
            { url: { ilike: `%${input.keyword}%` } },
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(magicLinkModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.magicLinkModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(magicLinkModel, relationsFilterToSQL(magicLinkModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / input.perPage)

  return { data, pageCount }
}
