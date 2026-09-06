import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationDeepseekModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class IntegrationDeepSeekService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationDeepseekModel.findFirst({
      where: { workspaceId },
    })
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
        .update(integrationDeepseekModel)
        .set({
          model: props.model,
          auth,
          temperature: props.temperature,
          maxOutputTokens: props.maxOutputTokens,
        })
        .where(eq(integrationDeepseekModel.id, existing.id))

      await this.audit(
        "update",
        "updated the DeepSeek integration configuration",
      )
      return
    }

    await db.transaction(async (tx) => {
      const [integration] = await tx
        .insert(integrationModel)
        .values({
          id: createId(),
          workspaceId: props.workspaceId,
          integrationType: "deepseek",
        })
        .returning()

      if (!integration) {
        throw new Error("Failed to create integration record")
      }

      await tx.insert(integrationDeepseekModel).values({
        id: createId(),
        integrationId: integration.id,
        workspaceId: props.workspaceId,
        model: props.model,
        auth,
        temperature: props.temperature,
        maxOutputTokens: props.maxOutputTokens,
      })
    })

    await this.audit("connect", "connected a new DeepSeek integration")
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
