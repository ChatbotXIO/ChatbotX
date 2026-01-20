import { prisma } from "@aha.chat/database"

export const getMailerLiteIntegration = async (chatbotId: string) => {
  return await prisma.integrationMailerLite.findFirst({
    where: { chatbotId },
  })
}
