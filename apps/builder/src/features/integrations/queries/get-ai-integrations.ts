import { db } from "@chatbotx.io/database/client"

type ListAIIntegrationsProps = {
  where: {
    chatbotId: bigint
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

export async function hasAIIntegration(chatbotId: bigint): Promise<boolean> {
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
