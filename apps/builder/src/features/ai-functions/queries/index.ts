import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AIFunctionCollection, GetAIFunctionsRequest } from "../schemas"

export async function getAIFunctions(
  input: GetAIFunctionsRequest,
): Promise<AIFunctionCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await prisma.aIFunction.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
    include: {
      triggerFlow: true,
    },
  })

  return { data }
}
