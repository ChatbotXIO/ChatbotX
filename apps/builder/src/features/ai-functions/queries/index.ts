import { aiFunctionService } from "@chatbotx.io/business"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import type { ListAIFunctionsRequest } from "../schema/action"

export async function listAIFunctions(
  input: ListAIFunctionsRequest,
): Promise<PaginatedResponse<AIFunctionModel>> {
  const data = await aiFunctionService.list({ workspaceId: input.workspaceId })

  return { data, pageCount: 1 }
}
