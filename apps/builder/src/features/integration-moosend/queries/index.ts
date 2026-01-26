import { prisma } from "@aha.chat/database"

export const getMoosendIntegration = async (chatbotId: string) => {
  return await prisma.integrationMoosend.findFirst({
    where: { chatbotId },
  })
}
