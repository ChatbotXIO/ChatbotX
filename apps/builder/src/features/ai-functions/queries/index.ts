import { db } from "@aha.chat/database/client"
import type { AIFunctionModel } from "@aha.chat/database/types"
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
