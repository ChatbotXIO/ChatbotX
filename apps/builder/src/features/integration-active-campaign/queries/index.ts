import { prisma } from "@aha.chat/database"

export const getActiveCampaignIntegration = async (chatbotId: string) => {
  return await prisma.integrationActiveCampaign.findFirst({
    where: {
      chatbotId,
    },
  })
}
