import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { WhatsappTemplateStatus } from "@chatbotx.io/database/partials"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"

export const whatsappMessageTemplateService = {
  list: (props: {
    tx?: DatabaseClient
    where: {
      workspaceId: string
      inboxId?: string
      integrationWhatsappId?: string
      status?: WhatsappTemplateStatus
    }
  }): Promise<ListWhatsappMessageTemplatesResponse> => {
    const { tx = db, where } = props

    const queryWhere = {
      status: where.status,
      integrationWhatsappId: where.integrationWhatsappId,
      integrationWhatsapp: {
        workspaceId: where.workspaceId,
        inboxId: where.inboxId,
      },
    }

    return tx.query.whatsappMessageTemplateModel.findMany({
      where: queryWhere,
      with: {
        integrationWhatsapp: true,
      },
      orderBy: { createdAt: "asc" },
    })
  },
}
