"use server"

import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { updateMessageCampaign } from "@chatbotx.io/integration-facebook-ads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildCampaignBudget } from "../lib/campaign-payload"
import { requireValidGrant } from "../lib/grant"
import { resolveContentAttachments } from "../lib/media-attachment"
import type { MmContent } from "../schema/content"
import {
  type UpdateMarketingMessageInput,
  updateMarketingMessageSchema,
} from "../schema/resource"

/**
 * Meta first, database second — same ordering as create (spec D9).
 *
 * `adAccountId`, `pageId`, `currency` and `budgetType` are frozen: changing
 * the account or Page means a different Meta campaign, not an edit of this
 * one, so they are read from the stored row and never from the input.
 *
 * Exported so the ordering can be unit-tested.
 */
export async function updateMarketingMessage({
  workspace,
  id,
  input,
}: {
  workspace: WorkspaceModel
  id: string
  input: UpdateMarketingMessageInput
}) {
  const existing = await facebookMarketingMessagesService.find({
    id,
    workspaceId: workspace.id,
  })
  if (!existing) {
    const t = await getTranslations()
    throw new ChatbotXException(t("facebookMarketingMessages.errors.notFound"))
  }

  const grant = await requireValidGrant(workspace)

  const content = await resolveContentAttachments({
    workspaceId: workspace.id,
    pageId: existing.pageId,
    content: input.content,
    previous: existing.content as MmContent,
  })

  // `budgetType` is frozen: the budget lives on the ad set, and flipping
  // daily → lifetime there needs an `end_time` the form does not collect.
  const budget = buildCampaignBudget({
    budgetType: existing.budgetType,
    budgetMajorUnits: input.budgetMajorUnits,
    currency: existing.currency,
  })

  await updateMessageCampaign({
    accessToken: grant.accessToken,
    campaignId: existing.campaignId,
    name: input.name,
    budgetType: budget.budgetType,
    budgetMinorUnits: budget.budgetMinorUnits,
    version: grant.version,
  })

  return await facebookMarketingMessagesService.update({
    id,
    workspaceId: workspace.id,
    name: input.name,
    budgetType: budget.budgetType,
    budgetMinorUnits: budget.budgetMinorUnits,
    content,
  })
}

export const updateMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMarketingMessageSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [, id],
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateMarketingMessageInput
    }) =>
      await updateMarketingMessage({
        workspace: ctx.workspace,
        id,
        input: parsedInput,
      }),
  )
