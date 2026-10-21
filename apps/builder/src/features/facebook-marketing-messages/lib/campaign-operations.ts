import "server-only"

import {
  facebookMarketingMessageDeliveryService,
  facebookMarketingMessagesService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  createMessageCampaign,
  deleteMessageCampaign,
  FacebookAdsException,
  updateMessageCampaign,
} from "@chatbotx.io/integration-facebook-ads"
import { getTranslations } from "next-intl/server"
import type { MmContent } from "../schema/content"
import type {
  CreateMarketingMessageInput,
  UpdateMarketingMessageInput,
} from "../schema/resource"
import { buildCampaignBudget } from "./campaign-payload"
import { withMmDeliveryErrors } from "./delivery-errors"
import { requireValidGrant } from "./grant"
import { resolveContentAttachments } from "./media-attachment"
import { requireTosAcceptedAdAccount } from "./tos-accepted-account"

/**
 * The one implementation behind both the builder actions and the public API
 * procedures (AGENTS.md invariant 23). Integration calls and services only —
 * no `db` here (invariant 9).
 */

/**
 * Meta first, database second (spec D9): the row is inserted only once Meta
 * has returned a campaign id, so a stored row always has a live campaign and
 * the edit path never has to handle one that does not.
 *
 * The attachment upload runs BEFORE the campaign create (D16) so a failed
 * upload leaves nothing created on Meta's side either.
 */
export async function createMarketingMessage({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: Omit<CreateMarketingMessageInput, "currency">
}) {
  const grant = await requireValidGrant(workspace)

  const account = await requireTosAcceptedAdAccount(grant, input.adAccountId)
  const t = await getTranslations()

  // Same reasoning as the ad account: the dropdown only lists matching ready
  // audiences, but the server must not trust it. Runs before any Meta call so
  // a bad audience leaves nothing created.
  const audienceId =
    input.targetType === "customAudience" ? input.audienceId : null
  if (input.targetType === "customAudience") {
    const audience = audienceId
      ? await facebookMarketingMessagesService.findTargetableAudience({
          workspaceId: workspace.id,
          audienceId,
          adAccountId: input.adAccountId,
          pageId: input.pageId,
        })
      : null
    if (!audience) {
      throw new ChatbotXException(
        t("facebookMarketingMessages.errors.audienceNotTargetable"),
      )
    }
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
    targetType: input.targetType,
    audienceId,
    campaignId: campaign.id,
    facebookUserId: grant.facebookUserId,
  })
}

/**
 * Meta first, database second — same ordering as create (spec D9).
 *
 * `adAccountId`, `pageId`, `currency` and `budgetType` are frozen: changing
 * the account or Page means a different Meta campaign, not an edit of this
 * one, so they are read from the stored row and never from the input.
 *
 * Content is locked once the first message has been sent (D10). The deep
 * compare lives in the business service (`assertContentEditable`) and runs
 * before any Meta call or attachment upload, so a refused edit has no side
 * effects. Name and budget edits stay allowed.
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
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.notFound"),
      "mmNotFound",
    )
  }

  await withMmDeliveryErrors(() =>
    facebookMarketingMessagesService.assertContentEditable({
      row: existing,
      content: input.content,
    }),
  )

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

  // The service writes a content change only while nothing has been sent,
  // so a send that started after the check above still refuses it here.
  return await withMmDeliveryErrors(() =>
    facebookMarketingMessagesService.update({
      id,
      workspaceId: workspace.id,
      name: input.name,
      budgetType: budget.budgetType,
      budgetMinorUnits: budget.budgetMinorUnits,
      content,
    }),
  )
}

// Graph answers code 100 / subcode 33 for an object that no longer exists
// (same pair `deleteCustomAudience` treats as "already gone").
const isMetaObjectMissing = (error: unknown) =>
  error instanceof FacebookAdsException &&
  error.code === 100 &&
  String(error.subCode) === "33"

/**
 * Meta first, database second (spec D10), per id. No grant → that id is
 * refused (never delete our row while Meta's campaign lives on). A Meta
 * error aborts that id and keeps its row; "object does not exist" (100/33)
 * counts as deleted so a row whose Meta campaign is already gone can still be
 * removed. Ids are processed in order and the first failure stops the run, so
 * ids before it are already deleted.
 */
export async function deleteMarketingMessages({
  workspace,
  ids,
}: {
  workspace: WorkspaceModel
  ids: string[]
}): Promise<void> {
  for (const id of ids) {
    const row = await facebookMarketingMessagesService.find({
      id,
      workspaceId: workspace.id,
    })
    if (!row) {
      continue
    }

    const grant =
      await facebookMarketingMessageDeliveryService.resolveGrantToken(
        workspace.id,
      )
    if (!grant) {
      const t = await getTranslations()
      throw new ChatbotXException(
        t("facebookMarketingMessages.errors.connectFirst"),
        "mmGrantInvalid",
      )
    }

    try {
      await deleteMessageCampaign({
        accessToken: grant.accessToken,
        campaignId: row.campaignId,
      })
    } catch (error) {
      if (!isMetaObjectMissing(error)) {
        const t = await getTranslations()
        throw new ChatbotXException(
          t("facebookMarketingMessages.errors.metaDeleteFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
          "mmMetaDeleteFailed",
        )
      }
    }

    await facebookMarketingMessagesService.remove({
      workspaceId: workspace.id,
      ids: [id],
    })
  }
}

export function stopMarketingMessage({
  workspace,
  id,
}: {
  workspace: WorkspaceModel
  id: string
}) {
  return withMmDeliveryErrors(() =>
    facebookMarketingMessageDeliveryService.stop({
      workspaceId: workspace.id,
      id,
    }),
  )
}

export function resumeMarketingMessage({
  workspace,
  id,
}: {
  workspace: WorkspaceModel
  id: string
}) {
  return withMmDeliveryErrors(() =>
    facebookMarketingMessageDeliveryService.resume({
      workspaceId: workspace.id,
      id,
    }),
  )
}

export function sendMarketingMessage({
  workspace,
  id,
}: {
  workspace: WorkspaceModel
  id: string
}) {
  return withMmDeliveryErrors(() =>
    facebookMarketingMessageDeliveryService.send({
      workspaceId: workspace.id,
      id,
    }),
  )
}
