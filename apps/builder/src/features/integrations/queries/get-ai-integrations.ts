import { aiProviders } from "@chatbotx.io/ai"
import { db } from "@chatbotx.io/database/client"

type ListAIIntegrationsProps = {
  where: {
    workspaceId: string
  }
}

export async function listAIIntegrations(props: ListAIIntegrationsProps) {
  return await db.query.integrationModel.findMany({
    where: {
      integrationType: {
        in: [...aiProviders.options],
      },
      workspaceId: props.where.workspaceId,
    },
  })
}

export async function hasAIIntegration(workspaceId: string): Promise<boolean> {
  const exists = await db.query.integrationModel.findFirst({
    where: {
      integrationType: {
        in: [...aiProviders.options],
      },
      workspaceId,
    },
  })

  return !!exists
}
