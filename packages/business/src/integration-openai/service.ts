import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"

class IntegrationOpenAIService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationOpenaiModel.findFirst({ where: { workspaceId } })
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
        .update(integrationOpenaiModel)
        .set({
          model: props.model,
          auth,
          temperature: props.temperature,
          maxOutputTokens: props.maxOutputTokens,
        })
        .where(eq(integrationOpenaiModel.id, existing.id))

      // connectOpenAIAction runs on authActionClient (not
      // workspaceActionClient), so the audit ALS actor never carries a
      // workspaceId — this.audit() would silently drop the record. Dispatch
      // explicitly with the workspaceId from props instead (dispatchAuditRecord,
      // not the ../audit barrel, to keep this file reachable from the
      // Edge-safe packages/business/src/index.ts entrypoint).
      await dispatchAuditRecord({
        workspaceId: props.workspaceId,
        action: "update",
        detail: "updated the OpenAI integration configuration",
      })
      return
    }

    await db.transaction(async (tx) => {
      const [integration] = await tx
        .insert(integrationModel)
        .values({
          id: createId(),
          workspaceId: props.workspaceId,
          integrationType: "openai",
        })
        .returning()

      if (!integration) {
        throw new Error("Failed to create integration record")
      }

      await tx.insert(integrationOpenaiModel).values({
        id: createId(),
        integrationId: integration.id,
        workspaceId: props.workspaceId,
        model: props.model,
        auth,
        temperature: props.temperature,
        maxOutputTokens: props.maxOutputTokens,
      })
    })

    // See comment above: authActionClient means no workspaceId in ALS.
    await dispatchAuditRecord({
      workspaceId: props.workspaceId,
      action: "connect",
      detail: "connected a new OpenAI integration",
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

    await this.audit("disconnect", "disconnected the OpenAI integration")
  }
}

export const integrationOpenAIService = new IntegrationOpenAIService()
