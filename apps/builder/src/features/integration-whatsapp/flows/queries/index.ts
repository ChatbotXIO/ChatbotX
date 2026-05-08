import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ListWhatsappFlowsResponse } from "@/features/integration-whatsapp/flows/schema/query"

export const whatsappFlowService = {
  list: (props: {
    tx?: DatabaseClient
    where: {
      workspaceId: string
      inboxId?: string
      integrationWhatsappId?: string
    }
  }): Promise<ListWhatsappFlowsResponse> => {
    const { tx = db, where } = props

    const queryWhere = {
      integrationWhatsappId: where.integrationWhatsappId,
      integrationWhatsapp: {
        workspaceId: where.workspaceId,
        inboxId: where.inboxId,
      },
    }

    return tx.query.whatsappFlowModel.findMany({
      where: queryWhere,
      with: {
        integrationWhatsapp: true,
      },
      orderBy: { createdAt: "asc" },
    })
  },
}
