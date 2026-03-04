import { db } from "@aha.chat/database/client"

type ListAIIntegrationsProps = {
  where: {
    chatbotId: string
  }
}

export async function listAIIntegrations(props: ListAIIntegrationsProps) {
  return await db.query.integrationModel.findMany({
    where: {
      integrationType: {
        in: ["openai", "gemini"],
      },
      chatbotId: props.where.chatbotId,
    },
  })
}

export async function hasAIIntegration(chatbotId: string): Promise<boolean> {
  const exists = await db.query.integrationModel.findFirst({
    where: {
      integrationType: {
        in: ["openai", "gemini"],
      },
      chatbotId,
    },
  })

  return !!exists
}
