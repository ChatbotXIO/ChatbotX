import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationMailerLiteModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationMailerLite_workspaceId_key"

const isWorkspaceUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT
  )
}

class IntegrationMailerLiteService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMailerLiteModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("MailerLite integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)

    const updateExisting = async () => {
      const [updated] = await db
        .update(integrationMailerLiteModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationMailerLiteModel.workspaceId, props.workspaceId))
        .returning({ id: integrationMailerLiteModel.id })
      return updated?.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      await this.audit(
        "update",
        "updated the MailerLite integration configuration",
      )
      return existingId
    }

    const integrationId = createId()
    const mailerLiteId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "mailerLite",
        })
        await tx.insert(integrationMailerLiteModel).values({
          id: mailerLiteId,
          workspaceId: props.workspaceId,
          integrationId,
          auth: encryptedAuth,
        })
      })
      await this.audit("connect", "connected a new MailerLite integration")
      return mailerLiteId
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
        "updated the MailerLite integration configuration",
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
        .delete(integrationMailerLiteModel)
        .where(eq(integrationMailerLiteModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })

    await this.audit("disconnect", "disconnected the MailerLite integration")
  }
}

export const integrationMailerLiteService = new IntegrationMailerLiteService()
