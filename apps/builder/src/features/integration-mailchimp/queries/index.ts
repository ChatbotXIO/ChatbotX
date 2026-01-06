import { prisma } from "@aha.chat/database"

export const getMailchimpIntegration = async (chatbotId: string) =>
  await prisma.integrationMailchimp.findFirst({
    where: {
      chatbotId,
    },
  })
