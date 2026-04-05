import { db } from "@chatbotx.io/database/client"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { ListAIFunctionsRequest } from "../schema/action"

export async function listAIFunctions(
  input: ListAIFunctionsRequest,
): Promise<PaginatedResponse<AIFunctionModel>> {
  const data = await db.query.aiFunctionModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
  })

  return { data, pageCount: 1 }
}
