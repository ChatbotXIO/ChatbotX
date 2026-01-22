import { prisma } from "@aha.chat/database"

export const getSendFoxIntegration = async (chatbotId: string) => {
  return await prisma.integrationSendFox.findFirst({
    where: { chatbotId },
  })
}
