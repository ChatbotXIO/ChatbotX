"use server"

import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import {
  createMessageCampaign,
  getMarketingMessagesAdAccounts,
} from "@chatbotx.io/integration-facebook-ads"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildCampaignBudget } from "../lib/campaign-payload"
import { requireValidGrant } from "../lib/grant"
import { resolveContentAttachments } from "../lib/media-attachment"
import { customAudienceTosUrl, isCustomAudienceTosAccepted } from "../lib/tos"
import {
  type CreateMarketingMessageInput,
  createMarketingMessageSchema,
} from "../schema/resource"

/**
 * Meta first, database second (spec D9): the row is inserted only once Meta
 * has returned a campaign id, so a stored row always has a live campaign and
 * the edit path never has to handle one that does not.
 *
 * The attachment upload runs BEFORE the campaign create (D16) so a failed
 * upload leaves nothing created on Meta's side either.
 *
 * Exported (not just the action) so the ordering can be unit-tested.
 */
export async function createMarketingMessage({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: CreateMarketingMessageInput
}) {
  const grant = await requireValidGrant(workspace)

  // Re-validate the ad account server-side: the client select is a
  // convenience, not a boundary. This also confirms the account is actually
  // visible to THIS grant.
  const accounts = await getMarketingMessagesAdAccounts(
    grant.accessToken,
    grant.version,
  )
  const account = accounts.find((row) => row.id === input.adAccountId)
  const t = await getTranslations()
  if (!account) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.notGranted"),
    )
  }
  if (!isCustomAudienceTosAccepted(account.tosAccepted)) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.tosNotAccepted", {
        url: customAudienceTosUrl(account.accountId),
      }),
    )
  }

  const content = await resolveContentAttachments({
    workspaceId: workspace.id,
    pageId: input.pageId,
    content: input.content,
  })

  const budget = buildCampaignBudget({
    budgetType: input.budgetType,
    budgetMajorUnits: input.budgetMajorUnits,
    currency: account.currency,
  })

  const campaign = await createMessageCampaign({
    accessToken: grant.accessToken,
    adAccountId: input.adAccountId,
    name: input.name,
    pageId: input.pageId,
    budgetType: budget.budgetType,
    budgetMinorUnits: budget.budgetMinorUnits,
    version: grant.version,
  })

  return await facebookMarketingMessagesService.create({
    workspaceId: workspace.id,
    name: input.name,
    pageId: input.pageId,
    adAccountId: input.adAccountId,
    currency: account.currency,
    currencyOffset: budget.currencyOffset,
    budgetType: budget.budgetType,
    budgetMinorUnits: budget.budgetMinorUnits,
    content,
    campaignId: campaign.id,
    facebookUserId: grant.facebookUserId,
  })
}

export const createMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMarketingMessageSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      parsedInput: CreateMarketingMessageInput
    }) =>
      await createMarketingMessage({
        workspace: ctx.workspace,
        input: parsedInput,
      }),
  )
