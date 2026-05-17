import { botFieldService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindBotFieldRequest,
  ListBotFieldsSearchParams,
} from "../schemas/query"
import type { BotFieldResource } from "../schemas/resource"

export async function listBotFields(
  input: ListBotFieldsSearchParams,
): Promise<PaginatedResponse<BotFieldResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return botFieldService.list(input)
}

export const findBotField = async (
  input: FindBotFieldRequest,
): Promise<BotFieldResource | undefined> =>
  await db.query.botFieldModel.findFirst({
    where: input,
  })
