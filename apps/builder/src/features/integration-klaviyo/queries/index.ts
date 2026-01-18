import { prisma } from "@aha.chat/database"

export const getKlaviyoIntegration = async (chatbotId: string) => {
  return await prisma.integrationKlaviyo.findFirst({
    where: { chatbotId },
  })
}

export const getKlaviyoData = async (chatbotId: string, action: string) => {
  const response = await fetch(
    `/api/chatbots/${chatbotId}/klaviyo?action=${action}`,
  )
  if (!response.ok) {
    throw new Error("Failed to fetch Klaviyo data")
  }
  return response.json()
}
