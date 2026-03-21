import { db } from "@chatbotx.io/database/client"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { GetAIFunctionsRequest } from "../schemas"

export async function listAIFunctions(
  input: GetAIFunctionsRequest,
): Promise<PaginatedResponse<AIFunctionModel>> {
  const data = await db.query.aiFunctionModel.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
  })

  return { data, pageCount: 1 }
}
