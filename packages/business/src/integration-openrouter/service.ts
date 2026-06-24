import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenrouterModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class IntegrationOpenRouterService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationOpenrouterModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("OpenRouter integration not found")
    }
    return integration
  }

  async connect(props: {
    workspaceId: string
    apiKey: string
    model: string
    temperature: number
    maxOutputTokens: number
  }) {
    const auth: SecretTextAuthValue = {
      authType: AuthType.secretText,
      secretText: props.apiKey,
    }

    const existing = await this.findByWorkspaceId(props.workspaceId)

    if (existing) {
      await db
        .update(integrationOpenrouterModel)
        .set({
          model: props.model,
          auth,
          temperature: props.temperature,
          maxOutputTokens: props.maxOutputTokens,
        })
        .where(eq(integrationOpenrouterModel.id, existing.id))
      return
    }

    await db.transaction(async (tx) => {
      const [integration] = await tx
        .insert(integrationModel)
        .values({
          id: createId(),
          workspaceId: props.workspaceId,
          integrationType: "openrouter",
        })
        .returning()

      if (!integration) {
        throw new Error("Failed to create integration record")
      }

      await tx.insert(integrationOpenrouterModel).values({
        id: createId(),
        integrationId: integration.id,
        workspaceId: props.workspaceId,
        model: props.model,
        auth,
        temperature: props.temperature,
        maxOutputTokens: props.maxOutputTokens,
      })
    })
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))
  }

  async update(workspaceId: string, data: Partial<{ autoReply: boolean }>) {
    const existing = await this.findByWorkspaceIdOrFail(workspaceId)
    await db
      .update(integrationOpenrouterModel)
      .set(data)
      .where(eq(integrationOpenrouterModel.id, existing.id))
  }
}

export const integrationOpenRouterService = new IntegrationOpenRouterService()
