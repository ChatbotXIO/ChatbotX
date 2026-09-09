import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import {
  type ConnectAiProviderInput,
  connectAiProviderIntegration,
} from "../integration-ai-provider/connect"

export type UpdateOpenAIInput = { autoReply?: boolean }

class IntegrationOpenAIService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationOpenaiModel.findFirst({ where: { workspaceId } })
  }

  findByWorkspaceIdAndId(props: { workspaceId: string; id: string }) {
    return db.query.integrationOpenaiModel.findFirst({
      where: { workspaceId: props.workspaceId, id: props.id },
    })
  }

  async connect(input: ConnectAiProviderInput) {
    const existing = await this.findByWorkspaceId(input.workspaceId)

    await connectAiProviderIntegration({
      table: integrationOpenaiModel,
      integrationType: "openai",
      input,
      existing,
    })

    await this.audit(
      existing ? "update" : "connect",
      existing
        ? "updated the OpenAI integration configuration"
        : "connected a new OpenAI integration",
    )
  }

  async update(
    props: { workspaceId: string; id: string },
    data: UpdateOpenAIInput,
  ) {
    const existing = await this.findByWorkspaceIdAndId(props)
    if (!existing) {
      throw new Error("Integration OpenAI not found")
    }

    const result = await db
      .update(integrationOpenaiModel)
      .set(data)
      .where(eq(integrationOpenaiModel.id, existing.id))
      .returning()
      .then((rows) => rows[0])

    await this.audit("update", "updated the OpenAI integration configuration")

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

    await this.audit("disconnect", "disconnected the OpenAI integration")
  }
}

export const integrationOpenAIService = new IntegrationOpenAIService()
