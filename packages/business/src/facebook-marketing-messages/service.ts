import type { FacebookMarketingMessageBudgetType } from "@chatbotx.io/database/partials"
import {
  facebookMarketingMessageRepository,
  facebookMarketingMessagesAuthRepository,
} from "@chatbotx.io/database/repositories"
import type {
  FacebookMarketingMessageModel,
  FacebookMarketingMessagesAuthModel,
} from "@chatbotx.io/database/types"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
} from "@chatbotx.io/integration-facebook-ads"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

export type CreateMarketingMessageInput = {
  workspaceId: string
  name: string
  pageId: string
  adAccountId: string
  currency: string
  currencyOffset: number
  budgetType: FacebookMarketingMessageBudgetType
  budgetMinorUnits: number
  content: unknown
  campaignId: string
  facebookUserId?: string | null
}

class FacebookMarketingMessagesService extends BaseService {
  findAuth(
    workspaceId: string,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    return facebookMarketingMessagesAuthRepository.findByWorkspaceId(
      workspaceId,
    )
  }

  /**
   * Store or replace the workspace's grant. Re-granting replaces the token,
   * refreshes the expiry, overwrites the App-Scoped User ID, and clears any
   * `invalid` status left by a prior Graph 190.
   */
  async upsertAuth(input: {
    workspaceId: string
    auth: FacebookAdsAuthValue
    tokenExpiresAt: Date | null
    facebookUserId?: string | null
  }): Promise<void> {
    const encryptedAuth = await encryptUtils.encryptObject(input.auth)
    const existing = await this.findAuth(input.workspaceId)

    if (existing) {
      await facebookMarketingMessagesAuthRepository.updateAuth({
        id: existing.id,
        auth: encryptedAuth,
        tokenExpiresAt: input.tokenExpiresAt,
        facebookUserId: input.facebookUserId ?? null,
      })
      await this.audit("update", "reconnected Facebook Marketing Messages")
      return
    }

    await facebookMarketingMessagesAuthRepository.create({
      id: createId(),
      workspaceId: input.workspaceId,
      auth: encryptedAuth,
      tokenExpiresAt: input.tokenExpiresAt,
      facebookUserId: input.facebookUserId ?? null,
    })
    await this.audit("create", "connected Facebook Marketing Messages")
  }

  /**
   * Returns `null` rather than throwing on an undecryptable blob — a rotated
   * encryption key must surface as "re-grant needed" in the UI, not a 500.
   */
  async decryptAuth(
    row: FacebookMarketingMessagesAuthModel,
  ): Promise<FacebookAdsAuthValue | null> {
    try {
      // `decryptObject` validates against a schema rather than casting —
      // same call shape as `messaging-ads-connection/context.ts`.
      return await encryptUtils.decryptObject(
        encryptedDataSchema.parse(row.auth),
        facebookAdsAuthSchema,
      )
    } catch {
      return null
    }
  }

  /** Called whenever Graph answers 190 (expired/invalidated token). */
  markAuthInvalid(workspaceId: string): Promise<void> {
    return facebookMarketingMessagesAuthRepository.updateStatus({
      workspaceId,
      status: "invalid",
    })
  }

  list(workspaceId: string): Promise<FacebookMarketingMessageModel[]> {
    return facebookMarketingMessageRepository.listByWorkspaceId(workspaceId)
  }

  find(input: {
    id: string
    workspaceId: string
  }): Promise<FacebookMarketingMessageModel | null> {
    return facebookMarketingMessageRepository.findForWorkspace(input)
  }

  async create(
    input: CreateMarketingMessageInput,
  ): Promise<FacebookMarketingMessageModel> {
    const row = await facebookMarketingMessageRepository.create({
      ...input,
      id: createId(),
      facebookUserId: input.facebookUserId ?? null,
    })
    await this.audit("create", `created the marketing message "${input.name}"`)
    return row
  }

  async update(input: {
    id: string
    workspaceId: string
    name: string
    budgetType: FacebookMarketingMessageBudgetType
    budgetMinorUnits: number
    content: unknown
  }): Promise<FacebookMarketingMessageModel | null> {
    const row = await facebookMarketingMessageRepository.update(input)
    await this.audit("update", `updated the marketing message "${input.name}"`)
    return row
  }

  async remove(input: { ids: string[]; workspaceId: string }): Promise<void> {
    await facebookMarketingMessageRepository.remove(input)
    await this.audit(
      "delete",
      `deleted ${input.ids.length} marketing message(s)`,
    )
  }
}

export const facebookMarketingMessagesService =
  new FacebookMarketingMessagesService()
