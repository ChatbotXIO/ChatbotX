import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationFacebookAdsModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationFacebookAds_workspaceId_key"

const isWorkspaceUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT
  )
}

class IntegrationFacebookAdsService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationFacebookAdsModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("Facebook Ads integration not found")
    }
    return integration
  }

  /**
   * Connect or reconnect the workspace's Facebook Ads account. Reconnecting
   * replaces the stored token, refreshes the expiry, and clears any
   * "invalid" status set by the worker on a 190 (expired token) error.
   */
  async upsert(props: {
    workspaceId: string
    auth: AuthValue
    tokenExpiresAt: Date | null
  }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)
    const values = {
      auth: encryptedAuth,
      tokenExpiresAt: props.tokenExpiresAt,
      status: "active" as const,
    }

    const updateExisting = async () => {
      const existing = await this.findByWorkspaceId(props.workspaceId)
      if (!existing) {
        return
      }
      await db
        .update(integrationFacebookAdsModel)
        .set(values)
        .where(eq(integrationFacebookAdsModel.id, existing.id))
      return existing.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      return existingId
    }

    const integrationId = createId()
    const facebookAdsId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "facebookAds",
        })
        await tx.insert(integrationFacebookAdsModel).values({
          id: facebookAdsId,
          workspaceId: props.workspaceId,
          integrationId,
          ...values,
        })
      })
      return facebookAdsId
    } catch (error) {
      if (!isWorkspaceUniqueViolation(error)) {
        throw error
      }
      const winnerId = await updateExisting()
      if (!winnerId) {
        throw error
      }
      return winnerId
    }
  }

  /**
   * Flag the connection as needing a reconnect (e.g. the worker received a
   * Graph error 190 — expired/invalidated token).
   */
  async markInvalid(workspaceId: string) {
    await db
      .update(integrationFacebookAdsModel)
      .set({ status: "invalid" })
      .where(eq(integrationFacebookAdsModel.workspaceId, workspaceId))
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(integrationFacebookAdsModel)
        .where(eq(integrationFacebookAdsModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })
  }
}

export const integrationFacebookAdsService = new IntegrationFacebookAdsService()
