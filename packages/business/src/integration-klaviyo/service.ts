import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationKlaviyoModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationKlaviyo_workspaceId_key"

const isWorkspaceUniqueViolation = (error: unknown): boolean =>
  isDatabaseError(error) &&
  error.cause.code === "23505" &&
  "constraint" in error.cause &&
  error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT

class IntegrationKlaviyoService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationKlaviyoModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("Klaviyo integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)
    const updateExisting = async () => {
      const [updated] = await db
        .update(integrationKlaviyoModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationKlaviyoModel.workspaceId, props.workspaceId))
        .returning({ id: integrationKlaviyoModel.id })
      return updated?.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      await this.audit(
        "update",
        "updated the Klaviyo integration configuration",
      )
      return existingId
    }

    const integrationId = createId()
    const klaviyoId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "klaviyo",
        })
        await tx.insert(integrationKlaviyoModel).values({
          id: klaviyoId,
          workspaceId: props.workspaceId,
          integrationId,
          auth: encryptedAuth,
        })
      })
      await this.audit("connect", "connected a new Klaviyo integration")
      return klaviyoId
    } catch (error) {
      if (!isWorkspaceUniqueViolation(error)) {
        throw error
      }
      const winnerId = await updateExisting()
      if (!winnerId) {
        throw error
      }
      await this.audit(
        "update",
        "updated the Klaviyo integration configuration",
      )
      return winnerId
    }
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(integrationKlaviyoModel)
        .where(eq(integrationKlaviyoModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })

    await this.audit("disconnect", "disconnected the Klaviyo integration")
  }
}

export const integrationKlaviyoService = new IntegrationKlaviyoService()
