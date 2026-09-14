import { and, type DatabaseClient, db, eq, inArray } from "../../client"
import type {
  FacebookMarketingMessageBudgetType,
  FacebookMarketingMessagesAuthStatus,
} from "../../partials/facebook-marketing-messages"
import {
  facebookMarketingMessageModel,
  facebookMarketingMessagesAuthModel,
} from "../../schema"
import type {
  FacebookMarketingMessageModel,
  FacebookMarketingMessagesAuthModel,
} from "../../types"

export const facebookMarketingMessagesAuthRepository = {
  async findByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    const row = await tx.query.facebookMarketingMessagesAuthModel.findFirst({
      where: { workspaceId },
    })
    return row ?? null
  },

  async create(
    input: {
      id: string
      workspaceId: string
      auth: unknown
      tokenExpiresAt: Date | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel> {
    const [row] = await tx
      .insert(facebookMarketingMessagesAuthModel)
      .values({ ...input, status: "active" })
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessagesAuth")
    }
    return row
  },

  /** Re-grant: replaces the token and clears any `invalid` status. */
  async updateAuth(
    input: {
      id: string
      auth: unknown
      tokenExpiresAt: Date | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessagesAuthModel | null> {
    const [row] = await tx
      .update(facebookMarketingMessagesAuthModel)
      .set({
        auth: input.auth,
        tokenExpiresAt: input.tokenExpiresAt,
        facebookUserId: input.facebookUserId,
        status: "active",
      })
      .where(eq(facebookMarketingMessagesAuthModel.id, input.id))
      .returning()
    return row ?? null
  },

  async updateStatus(
    input: { workspaceId: string; status: FacebookMarketingMessagesAuthStatus },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(facebookMarketingMessagesAuthModel)
      .set({ status: input.status })
      .where(
        eq(facebookMarketingMessagesAuthModel.workspaceId, input.workspaceId),
      )
  },
}

type CreateFacebookMarketingMessageInput = {
  id: string
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
  facebookUserId: string | null
}

export const facebookMarketingMessageRepository = {
  async listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel[]> {
    return await tx.query.facebookMarketingMessageModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const row = await tx.query.facebookMarketingMessageModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  async create(
    input: CreateFacebookMarketingMessageInput,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel> {
    const [row] = await tx
      .insert(facebookMarketingMessageModel)
      .values(input)
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessage")
    }
    return row
  },

  /**
   * Only the mutable fields. `adAccountId`, `pageId` and `campaignId` are
   * frozen after creation — changing the account or Page means a different
   * Meta campaign, not an edit of this one.
   */
  async update(
    input: {
      id: string
      workspaceId: string
      name: string
      budgetType: FacebookMarketingMessageBudgetType
      budgetMinorUnits: number
      content: unknown
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageModel | null> {
    const [row] = await tx
      .update(facebookMarketingMessageModel)
      .set({
        name: input.name,
        budgetType: input.budgetType,
        budgetMinorUnits: input.budgetMinorUnits,
        content: input.content,
      })
      .where(
        and(
          eq(facebookMarketingMessageModel.id, input.id),
          eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row ?? null
  },

  async remove(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .delete(facebookMarketingMessageModel)
      .where(
        and(
          inArray(facebookMarketingMessageModel.id, input.ids),
          eq(facebookMarketingMessageModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
