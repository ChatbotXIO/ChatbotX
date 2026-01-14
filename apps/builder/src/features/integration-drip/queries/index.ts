import { prisma } from "@aha.chat/database"

export async function getDripIntegration(chatbotId: string) {
  return await prisma.integrationDrip.findFirst({
    where: { chatbotId },
    select: {
      id: true,
      apiToken: true,
      accountId: true,
      createdAt: true,
    },
  })
}
