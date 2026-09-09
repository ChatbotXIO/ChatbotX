import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationDeepseekModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import {
  type ConnectAiProviderInput,
  connectAiProviderIntegration,
} from "../integration-ai-provider/connect"

export type UpdateDeepSeekInput = { autoReply?: boolean }

class IntegrationDeepSeekService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationDeepseekModel.findFirst({
      where: { workspaceId },
    })
  }

  async connect(input: ConnectAiProviderInput) {
    const existing = await this.findByWorkspaceId(input.workspaceId)

    await connectAiProviderIntegration({
      table: integrationDeepseekModel,
      integrationType: "deepseek",
      input,
      existing,
    })

    await this.audit(
      existing ? "update" : "connect",
      existing
        ? "updated the DeepSeek integration configuration"
        : "connected a new DeepSeek integration",
    )
  }

  async update(props: { workspaceId: string }, data: UpdateDeepSeekInput) {
    const existing = await this.findByWorkspaceId(props.workspaceId)
    if (!existing) {
      throw new Error("Integration DeepSeek not found")
    }

    const result = await db
      .update(integrationDeepseekModel)
      .set(data)
      .where(eq(integrationDeepseekModel.id, existing.id))
      .returning()
      .then((rows) => rows[0])

    await this.audit("update", "updated the DeepSeek integration configuration")

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

    await this.audit("disconnect", "disconnected the DeepSeek integration")
  }
}

export const integrationDeepSeekService = new IntegrationDeepSeekService()
