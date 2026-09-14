import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"

export type MessageCampaignBudget = {
  budgetType: "daily" | "lifetime"
  /** Minor units, already converted with the ad account's currency offset. */
  budgetMinorUnits: number
}

/** Meta CREATE endpoints return only `{ id }` (plus optional info/warning). */
const createResponseSchema = z.object({ id: z.string().trim().min(1) })

function budgetFields(budget: MessageCampaignBudget): Record<string, number> {
  return budget.budgetType === "daily"
    ? { daily_budget: budget.budgetMinorUnits }
    : { lifetime_budget: budget.budgetMinorUnits }
}

/**
 * `POST /act_<AD_ACCOUNT_ID>/message_campaign`.
 *
 * `pixel_id`, `start_time` and `end_time` are deliberately not parameters —
 * Meta's defaults apply (start = now; end = start + 30 days for a lifetime
 * budget, none for a daily budget).
 *
 * The response may carry `info` or `warning` alongside `id` when Meta applies
 * an estimated budget cap or judges the budget below its reference. That is
 * NOT a failure: the schema only requires `id`.
 */
export function createMessageCampaign(
  input: {
    accessToken: string
    adAccountId: string
    name: string
    pageId: string
    version?: string
  } & MessageCampaignBudget,
): Promise<{ id: string }> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.adAccountId}/message_campaign`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.postJsonFields<unknown>(
      endpoint,
      {
        access_token: input.accessToken,
        name: input.name,
        page_id: input.pageId,
        ...budgetFields(input),
      },
    )
    return createResponseSchema.parse(response)
  })
}

/**
 * The id returned by `POST /act_<AD_ACCOUNT_ID>/message_campaign` is NOT a
 * campaign id — the edge creates campaign → ad set → ad in one call and hands
 * back the **ad**. Meta's own read example proves it, because `adset` is a
 * nested edge on the node and the budget is read from inside it:
 *
 *   GET /<MESSAGE_CAMPAIGN_ID>?fields=id,campaign{name},creative{actor_id},
 *       adset{name,lifetime_budget,daily_budget,start_time,end_time}
 *
 * So the budget lives on the AD SET, exactly as in the long-hand MAPI flow
 * (`POST /act_<AD_ACCOUNT_ID>/adsets` takes `daily_budget`/`lifetime_budget`).
 */
const adSetLookupSchema = z.object({
  adset: z.object({ id: z.string().trim().min(1) }),
})

/** `GET /<MESSAGE_CAMPAIGN_ID>?fields=adset{id}` — the ad set holding the budget. */
export function getMessageCampaignAdSetId(input: {
  accessToken: string
  campaignId: string
  version?: string
}): Promise<string> {
  const { version = DEFAULT_API_VERSION } = input
  const endpoint = `${version}/${input.campaignId}`

  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: { access_token: input.accessToken, fields: "adset{id}" },
    })
    return adSetLookupSchema.parse(response).adset.id
  })
}

/**
 * Updates the mutable fields of a message campaign — TWO writes, because the
 * name and the budget live on different nodes:
 *
 *   1. `POST /<AD_SET_ID>`          — `daily_budget` / `lifetime_budget`
 *   2. `POST /<MESSAGE_CAMPAIGN_ID>` — `name` (the ad's own name)
 *
 * Posting the budget to the message-campaign (ad) node instead is a SILENT
 * no-op: Graph drops write params a node does not own and still answers
 * `{"success": true}`, so the edit appears to save while Ads Manager keeps the
 * old budget. That was the original bug here.
 *
 * Budget goes first on purpose. It is the write Meta can reject (a below-
 * minimum budget for the account currency), and failing before the rename
 * leaves Meta completely untouched rather than half-applied.
 *
 * `budgetType` is frozen by the caller: switching daily ↔ lifetime needs a
 * schedule (`end_time`) that the edit form does not collect, and Meta rejects
 * a lifetime budget without one.
 */
export async function updateMessageCampaign(
  input: {
    accessToken: string
    campaignId: string
    name: string
    version?: string
  } & MessageCampaignBudget,
): Promise<void> {
  const { version = DEFAULT_API_VERSION } = input

  const adSetId = await getMessageCampaignAdSetId({
    accessToken: input.accessToken,
    campaignId: input.campaignId,
    version,
  })

  const adSetEndpoint = `${version}/${adSetId}`
  await rescue(adSetEndpoint, async () => {
    await facebookAdsGraphClient.postJsonFields<unknown>(adSetEndpoint, {
      access_token: input.accessToken,
      ...budgetFields(input),
    })
  })

  const nodeEndpoint = `${version}/${input.campaignId}`
  await rescue(nodeEndpoint, async () => {
    await facebookAdsGraphClient.postJsonFields<unknown>(nodeEndpoint, {
      access_token: input.accessToken,
      name: input.name,
    })
  })
}
