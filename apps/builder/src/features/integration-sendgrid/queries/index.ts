import { prisma } from "@aha.chat/database"

export const getSendGridIntegration = async (chatbotId: string) => {
  return await prisma.integrationSendGrid.findFirst({
    where: { chatbotId },
  })
}
