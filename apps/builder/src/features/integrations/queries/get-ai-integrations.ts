import { IntegrationType, prisma } from "@aha.chat/database"

type ListAIIntegrationsProps = {
  where: {
    chatbotId: string
  }
}

export async function listAIIntegrations(props: ListAIIntegrationsProps) {
  return await prisma.integration.findMany({
    where: {
      integrationType: {
        in: [IntegrationType.openai, IntegrationType.gemini],
      },
      chatbotId: props.where.chatbotId,
    },
  })
}

export async function hasAIIntegration(chatbotId: string): Promise<boolean> {
  const exists = await prisma.integration.findFirst({
    where: {
      integrationType: {
        in: [IntegrationType.openai, IntegrationType.gemini],
      },
      chatbotId,
    },
  })

  return !!exists
}
