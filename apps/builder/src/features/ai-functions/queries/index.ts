import { aiFunctionService } from "@chatbotx.io/business"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAIFunctionsRequest } from "../schema/action"

export async function listAIFunctions(
  input: ListAIFunctionsRequest,
): Promise<PaginatedResponse<AIFunctionModel>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await aiFunctionService.listAIFunctions(input)
}
