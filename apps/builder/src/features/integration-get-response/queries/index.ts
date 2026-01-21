import { prisma } from "@aha.chat/database"

export const getGetResponseIntegration = async (chatbotId: string) => {
  return await prisma.integrationGetResponse.findFirst({
    where: { chatbotId },
  })
}
