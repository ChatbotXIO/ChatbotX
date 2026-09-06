import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationGeminiModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class IntegrationGeminiService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationGeminiModel.findFirst({ where: { workspaceId } })
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
        .update(integrationGeminiModel)
        .set({
          model: props.model,
          auth,
          temperature: props.temperature,
          maxOutputTokens: props.maxOutputTokens,
        })
        .where(eq(integrationGeminiModel.id, existing.id))

      await this.audit("update", "updated the Gemini integration configuration")
      return
    }

    await db.transaction(async (tx) => {
      const [integration] = await tx
        .insert(integrationModel)
        .values({
          id: createId(),
          workspaceId: props.workspaceId,
          integrationType: "gemini",
        })
        .returning()

      if (!integration) {
        throw new Error("Failed to create integration record")
      }

      await tx.insert(integrationGeminiModel).values({
        id: createId(),
        integrationId: integration.id,
        workspaceId: props.workspaceId,
        model: props.model,
        auth,
        temperature: props.temperature,
        maxOutputTokens: props.maxOutputTokens,
      })
    })

    await this.audit("connect", "connected a new Gemini integration")
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
