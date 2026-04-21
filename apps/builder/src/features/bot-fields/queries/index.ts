import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { customFieldModel } from "@chatbotx.io/database/schema"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindBotFieldByKeyRequest,
  FindBotFieldRequest,
  ListBotFieldsSearchParams,
} from "../schemas/query"
import type { BotFieldResource } from "../schemas/resource"

const REGEX_BOT_FIELD_ID = /^\d+$/

export async function listBotFields(
  input: ListBotFieldsSearchParams,
): Promise<PaginatedResponse<BotFieldResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
    name: input.name
      ? {
          ilike: `%${input.name.toLowerCase()}%`,
        }
      : undefined,
  }

  const orderBy = parseOrderByAsObject(customFieldModel, input)

  const pagination = parsePagination(input)
  const [data, total] = await Promise.all([
    db.query.botFieldModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(customFieldModel, relationsFilterToSQL(customFieldModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount }
}

export const findBotField = async (
  input: FindBotFieldRequest,
): Promise<BotFieldResource | undefined> =>
  await db.query.botFieldModel.findFirst({
    where: input,
  })

export const findBotFieldByKey = async (
  input: FindBotFieldByKeyRequest,
): Promise<BotFieldResource | undefined> =>
  await db.query.botFieldModel.findFirst({
    where: {
      [REGEX_BOT_FIELD_ID.test(input.key) ? "id" : "name"]: input.key,
      workspaceId: input.workspaceId,
    },
  })
