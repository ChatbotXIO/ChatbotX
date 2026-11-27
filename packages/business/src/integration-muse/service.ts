import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationMuseModel,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import {
  type ConnectAiProviderInput,
  connectAiProviderIntegration,
} from "../integration-ai-provider/connect"

export type UpdateMuseInput = { autoReply?: boolean }

class IntegrationMuseService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMuseModel.findFirst({
      where: { workspaceId },
    })
  }

  async connect(input: ConnectAiProviderInput) {
    const existing = await this.findByWorkspaceId(input.workspaceId)

    await connectAiProviderIntegration({
      table: integrationMuseModel,
      integrationType: "muse",
      input,
      existing,
    })

    await this.audit(
      existing ? "update" : "connect",
      existing
        ? "updated the Muse integration configuration"
        : "connected a new Muse integration",
    )
  }

  async update(props: { workspaceId: string }, data: UpdateMuseInput) {
    const existing = await this.findByWorkspaceId(props.workspaceId)
    if (!existing) {
      throw new Error("Integration Muse not found")
    }

    const result = await db
      .update(integrationMuseModel)
      .set(data)
      .where(eq(integrationMuseModel.id, existing.id))
      .returning()
      .then((rows) => rows[0])

    await this.audit("update", "updated the Muse integration configuration")

    return result
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))

    await this.audit("disconnect", "disconnected the Muse integration")
  }
}

export const integrationMuseService = new IntegrationMuseService()
