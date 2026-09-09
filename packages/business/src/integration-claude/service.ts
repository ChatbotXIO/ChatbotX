import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationClaudeModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"
import {
  type ConnectAiProviderInput,
  connectAiProviderIntegration,
} from "../integration-ai-provider/connect"

export type UpdateClaudeInput = { autoReply?: boolean }

class IntegrationClaudeService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationClaudeModel.findFirst({ where: { workspaceId } })
  }

  async connect(input: ConnectAiProviderInput) {
    const existing = await this.findByWorkspaceId(input.workspaceId)

    await connectAiProviderIntegration({
      table: integrationClaudeModel,
      integrationType: "claude",
      input,
      existing,
    })

    await this.audit(
      existing ? "update" : "connect",
      existing
        ? "updated the Claude integration configuration"
        : "connected a new Claude integration",
    )
  }

  async update(props: { workspaceId: string }, data: UpdateClaudeInput) {
    const existing = await this.findByWorkspaceId(props.workspaceId)
    if (!existing) {
      throw new Error("Integration Claude not found")
    }

    const result = await db
      .update(integrationClaudeModel)
      .set(data)
      .where(eq(integrationClaudeModel.id, existing.id))
      .returning()
      .then((rows) => rows[0])

    await this.audit("update", "updated the Claude integration configuration")

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

    await this.audit("disconnect", "disconnected the Claude integration")
  }
}

export const integrationClaudeService = new IntegrationClaudeService()
