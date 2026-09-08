import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationGeminiModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import {
  type ConnectAiProviderInput,
  connectAiProviderIntegration,
} from "../integration-ai-provider/connect"

export type UpdateGeminiInput = { autoReply?: boolean }

class IntegrationGeminiService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationGeminiModel.findFirst({ where: { workspaceId } })
  }

  async connect(input: ConnectAiProviderInput) {
    const existing = await this.findByWorkspaceId(input.workspaceId)

    await connectAiProviderIntegration({
      table: integrationGeminiModel,
      integrationType: "gemini",
      input,
      existing,
    })

    await this.audit(
      existing ? "update" : "connect",
      existing
        ? "updated the Gemini integration configuration"
        : "connected a new Gemini integration",
    )
  }

  async update(workspaceId: string, data: UpdateGeminiInput) {
    const existing = await db.query.integrationGeminiModel.findFirst({
      where: { workspaceId },
    })
    if (!existing) {
      throw new Error("Integration Gemini not found")
    }

    await db
      .update(integrationGeminiModel)
      .set(data)
      .where(eq(integrationGeminiModel.id, existing.id))

    await this.audit("update", "updated the Gemini integration configuration")
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))

    await this.audit("disconnect", "disconnected the Gemini integration")
  }
}

export const integrationGeminiService = new IntegrationGeminiService()
