import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationGetResponseModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationGetResponse_workspaceId_key"

const isWorkspaceUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT
  )
}

class IntegrationGetResponseService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationGetResponseModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("GetResponse integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)

    const updateExisting = async () => {
      const [updated] = await db
        .update(integrationGetResponseModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationGetResponseModel.workspaceId, props.workspaceId))
        .returning({ id: integrationGetResponseModel.id })
      return updated?.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      await this.audit(
        "update",
        "updated the GetResponse integration configuration",
      )
      return existingId
    }

    const integrationId = createId()
    const getResponseId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "getResponse",
        })
        await tx.insert(integrationGetResponseModel).values({
          id: getResponseId,
          workspaceId: props.workspaceId,
          integrationId,
          auth: encryptedAuth,
        })
      })
      await this.audit("connect", "connected a new GetResponse integration")
      return getResponseId
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
        "updated the GetResponse integration configuration",
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
        .delete(integrationGetResponseModel)
        .where(eq(integrationGetResponseModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })

    await this.audit("disconnect", "disconnected the GetResponse integration")
  }
}

export const integrationGetResponseService = new IntegrationGetResponseService()
