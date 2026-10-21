import {
  facebookMarketingMessageDeliveryService,
  facebookMarketingMessagesService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { MARKETING_MESSAGE_STOP_TOKEN_PATH } from "@/lib/workspace/authorize-workspace-access"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createAudience,
  deleteAudience,
  uploadMoreAudience,
} from "../lib/audience-operations"
import {
  createMarketingMessage,
  deleteMarketingMessages,
  resumeMarketingMessage,
  sendMarketingMessage,
  stopMarketingMessage,
  updateMarketingMessage,
} from "../lib/campaign-operations"
import { withMmDeliveryErrors } from "../lib/delivery-errors"
import {
  getMarketingMessagesAudiencesLiveStatus,
  listMarketingMessagesAdAccounts,
  listMarketingMessagesAudiences,
  listMarketingMessagesPages,
} from "../lib/read-operations"
import { getMarketingMessagesStatistics } from "../lib/statistics-operations"
import {
  adAccountsOutputSchema,
  audienceIdParamSchema,
  audiencesListInputSchema,
  audiencesListOutputSchema,
  audiencesLiveOutputSchema,
  campaignDetailSchema,
  campaignIdParamSchema,
  campaignResourceSchema,
  createAudiencePublicRequest,
  createCampaignPublicRequest,
  pagesOutputSchema,
  updateCampaignPublicRequest,
  uploadMoreAudiencePublicRequest,
  uploadOutcomeSchema,
} from "../schema/public"
import {
  statisticsInputSchema,
  statisticsOutputSchema,
} from "../schema/statistics"

// The `ads` scope already guards ad spend, which is what a campaign is; a new
// scope would need its own token UI and i18n cascade.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ads")

const TAGS = ["Marketing Messages"]

function toCampaignResource(row: FacebookMarketingMessageModel) {
  return {
    id: row.id,
    name: row.name,
    pageId: row.pageId,
    adAccountId: row.adAccountId,
    currency: row.currency,
    budgetType: row.budgetType,
    budgetMinorUnits: row.budgetMinorUnits,
    content: row.content,
    targetType: row.targetType,
    audienceId: row.audienceId ?? null,
    campaignId: row.campaignId,
    status: row.status,
    statusReason: row.statusReason ?? null,
    statusErrorCode: row.statusErrorCode ?? null,
    statusErrorMessage: row.statusErrorMessage ?? null,
    startsAt: row.startsAt ?? null,
    startedAt: row.startedAt ?? null,
    firstSentAt: row.firstSentAt ?? null,
    completedAt: row.completedAt ?? null,
    nextDayAt: row.nextDayAt ?? null,
    tokenCount: row.tokenCount ?? null,
    createdAt: row.createdAt,
  } as z.infer<typeof campaignResourceSchema>
}

export const facebookMarketingMessagesPublicRouter = {
  pages: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/pages",
        summary: "List Messenger Pages for Marketing Messages",
        description:
          "Use this to find the `pageId` for `facebookMarketingMessages.campaigns.create` and `facebookMarketingMessages.audiences.create`. Returns the workspace's connected Messenger Pages.",
        tags: TAGS,
      })
      .output(pagesOutputSchema)
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context }) =>
          await listMarketingMessagesPages(context.workspace.id),
      ),
  },

  adAccounts: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/ad-accounts",
        summary: "List ad accounts for Marketing Messages",
        description:
          "Use this to find the `adAccountId` (`act_...`) for `facebookMarketingMessages.campaigns.create` and `facebookMarketingMessages.audiences.create`. Check `tosAccepted`: custom audiences need the terms accepted at `tosUrl`. Requires the workspace to have connected Marketing Messages in the web app (an OAuth step that cannot be done through the API).",
        tags: TAGS,
      })
      .output(adAccountsOutputSchema)
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context }) =>
          await listMarketingMessagesAdAccounts(context.workspace),
      ),
  },

  campaigns: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/campaigns",
        summary: "List Marketing Messages campaigns",
        description:
          "Lists the workspace's Marketing Messages campaigns with their delivery status (`status`, `statusReason`, `startsAt`, `tokenCount`, ...). Use `facebookMarketingMessages.campaigns.get` for one campaign's delivery counts and errors.",
        tags: TAGS,
      })
      .output(z.object({ campaigns: z.array(campaignResourceSchema) }))
      .errors(possibleErrorsOnListingResource)
      .handler(async ({ context }) => {
        const rows = await facebookMarketingMessagesService.list(
          context.workspace.id,
        )
        return { campaigns: rows.map(toCampaignResource) }
      }),

    get: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/campaigns/{id}",
        summary: "Get Marketing Messages campaign",
        description:
          "Returns one campaign with its delivery status and a `stats` object: recipient `counts` (pending, sent, delivered, failed, unconfirmed) and an `errors` breakdown. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(campaignIdParamSchema)
      .output(campaignDetailSchema)
      .errors(possibleErrorsOnFindingResource)
      .handler(async ({ context, input }) => {
        const row = await facebookMarketingMessagesService.find({
          id: input.id,
          workspaceId: context.workspace.id,
        })
        if (!row) {
          throw new ChatbotXException(
            "Marketing message not found.",
            "mmNotFound",
            404,
          )
        }
        const stats = await withMmDeliveryErrors(() =>
          facebookMarketingMessageDeliveryService.getStats({
            workspaceId: context.workspace.id,
            id: input.id,
          }),
        )
        return {
          ...toCampaignResource(row),
          stats: { counts: stats.counts, errors: stats.errors },
        }
      }),

    create: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/marketing-messages/campaigns",
        summary: "Create Marketing Messages campaign",
        description:
          "Creates the Meta message campaign and a matching campaign in the workspace; it starts sending automatically one hour after creation (stop it in that window with `facebookMarketingMessages.campaigns.stop`). Get `pageId` from `facebookMarketingMessages.pages.list`, `adAccountId` from `facebookMarketingMessages.adAccounts.list`, and for `targetType: customAudience` the `audienceId` of a ready audience from `facebookMarketingMessages.audiences.list`. Budget is in major units of the ad account currency.",
        successStatus: 201,
        tags: TAGS,
      })
      .input(createCampaignPublicRequest)
      .output(campaignResourceSchema)
      .errors(possibleErrorsOnCreatingResource)
      .handler(async ({ context, input }) =>
        toCampaignResource(
          await createMarketingMessage({
            workspace: context.workspace,
            input: { ...input, audienceId: input.audienceId ?? null },
          }),
        ),
      ),

    update: workspaceTokenAuthAPI
      .route({
        method: "PUT",
        path: "/v1/marketing-messages/campaigns/{id}",
        summary: "Update Marketing Messages campaign",
        description:
          "Updates the name, budget amount and content. Account, Page, currency, budget type and target cannot change. Once the campaign has started (any status other than `notSent`/`scheduled`) or its first message has been sent, `content` is locked (`mmContentLocked`); name and budget can still change. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(updateCampaignPublicRequest)
      .output(campaignResourceSchema)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        const { id, ...rest } = input
        const row = await updateMarketingMessage({
          workspace: context.workspace,
          id,
          input: rest,
        })
        if (!row) {
          throw new ChatbotXException(
            "Marketing message not found.",
            "mmNotFound",
            404,
          )
        }
        return toCampaignResource(row)
      }),

    delete: workspaceTokenAuthAPI
      .route({
        method: "DELETE",
        path: "/v1/marketing-messages/campaigns/{id}",
        summary: "Delete Marketing Messages campaign",
        description:
          "Deletes the Meta message campaign first, then the workspace campaign. If Meta refuses, the campaign is kept (`mmMetaDeleteFailed`). Needs a connected Marketing Messages grant. Allowed even when the workspace trial has expired. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(campaignIdParamSchema)
      .output(z.object({ id: z.string() }))
      .errors(possibleErrorsOnDeletingResource)
      .handler(async ({ context, input }) => {
        await deleteMarketingMessages({
          workspace: context.workspace,
          ids: [input.id],
        })
        return { id: input.id }
      }),

    stop: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: MARKETING_MESSAGE_STOP_TOKEN_PATH,
        summary: "Stop Marketing Messages campaign",
        description:
          "Stops a scheduled, sending, waiting or paused campaign; no further messages are sent. It does not touch the Meta campaign. Allowed even when the workspace trial has expired. Resume with `facebookMarketingMessages.campaigns.resume`. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(campaignIdParamSchema)
      .output(campaignResourceSchema)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) =>
        toCampaignResource(
          await stopMarketingMessage({
            workspace: context.workspace,
            id: input.id,
          }),
        ),
      ),

    resume: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/marketing-messages/campaigns/{id}/resume",
        summary: "Resume Marketing Messages campaign",
        description:
          "Resumes a paused or stopped campaign. A daily-budget campaign first re-estimates today's send target. Refused if the Meta campaign has ended (`mmCampaignEnded`) or Marketing Messages is not connected. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(campaignIdParamSchema)
      .output(campaignResourceSchema)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) =>
        toCampaignResource(
          await resumeMarketingMessage({
            workspace: context.workspace,
            id: input.id,
          }),
        ),
      ),

    send: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/marketing-messages/campaigns/{id}/send",
        summary: "Send Marketing Messages campaign",
        description:
          "Starts sending a campaign whose status is `notSent` (campaigns that existed before automatic sending). Refused for any other status. Get the id from `facebookMarketingMessages.campaigns.list`.",
        tags: TAGS,
      })
      .input(campaignIdParamSchema)
      .output(campaignResourceSchema)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) =>
        toCampaignResource(
          await sendMarketingMessage({
            workspace: context.workspace,
            id: input.id,
          }),
        ),
      ),
  },

  audiences: {
    list: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/audiences",
        summary: "List Marketing Messages custom audiences",
        description:
          "Lists custom audiences. Filter by `adAccountId` and `pageId`, or pass `readyOnly` to get only audiences a campaign can target (`readyAt` set). Use the `id` as `audienceId` in `facebookMarketingMessages.campaigns.create`.",
        tags: TAGS,
      })
      .input(audiencesListInputSchema)
      .output(audiencesListOutputSchema)
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context, input }) =>
          await listMarketingMessagesAudiences(context.workspace.id, input),
      ),

    liveStatus: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/audiences/live",
        summary: "Live status of Marketing Messages custom audiences",
        description:
          "Live size estimate and readiness per audience, keyed by `customAudienceId` from `facebookMarketingMessages.audiences.list`. An audience becomes `ready` some time after rows are uploaded.",
        tags: TAGS,
      })
      .output(audiencesLiveOutputSchema)
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context }) =>
          await getMarketingMessagesAudiencesLiveStatus(context.workspace),
      ),

    create: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/marketing-messages/audiences",
        summary: "Create custom audience from rows",
        description:
          "Creates a custom audience on Meta and uploads the rows (hashed server-side). Send `headers` (must include an email or phone column) and `rows` (up to 100,000). Returns an outcome: `ok` with counts, `partial` if the audience exists but the upload stopped (continue with `facebookMarketingMessages.audiences.uploadMore`; do not call create again), or `invalid` if nothing was created. Get `adAccountId` from `facebookMarketingMessages.adAccounts.list` and `pageId` from `facebookMarketingMessages.pages.list`.",
        successStatus: 201,
        tags: TAGS,
      })
      .input(createAudiencePublicRequest)
      .output(uploadOutcomeSchema)
      .errors(possibleErrorsOnCreatingResource)
      .handler(async ({ context, input }) => {
        const { headers, rows, ...rest } = input
        return await createAudience({
          workspace: context.workspace,
          input: { ...rest, table: { headers, rows } },
        })
      }),

    uploadMore: workspaceTokenAuthAPI
      .route({
        method: "POST",
        path: "/v1/marketing-messages/audiences/{id}/rows",
        summary: "Upload more rows to custom audience",
        description:
          "Adds rows to an existing audience, same body format and limits as `facebookMarketingMessages.audiences.create`. Get the id from `facebookMarketingMessages.audiences.list`.",
        tags: TAGS,
      })
      .input(uploadMoreAudiencePublicRequest)
      .output(uploadOutcomeSchema)
      .errors(possibleErrorsOnMutatingResource)
      .handler(async ({ context, input }) => {
        const { id, headers, rows } = input
        return await uploadMoreAudience({
          workspace: context.workspace,
          input: { id, table: { headers, rows } },
        })
      }),

    delete: workspaceTokenAuthAPI
      .route({
        method: "DELETE",
        path: "/v1/marketing-messages/audiences/{id}",
        summary: "Delete custom audience",
        description:
          "Deletes the audience on Meta and in the workspace. Refused while a campaign targets it. Get the id from `facebookMarketingMessages.audiences.list`.",
        tags: TAGS,
      })
      .input(audienceIdParamSchema)
      .output(z.object({ id: z.string() }))
      .errors(possibleErrorsOnDeletingResource)
      .handler(async ({ context, input }) => {
        await deleteAudience({ workspace: context.workspace, id: input.id })
        return { id: input.id }
      }),
  },

  statistics: {
    get: workspaceTokenAuthAPI
      .route({
        method: "GET",
        path: "/v1/marketing-messages/statistics",
        summary: "Get Marketing Messages statistics",
        description:
          "Meta performance insights (delivered, read rate, link clicks, link click rate, cost per click, cost per delivery, spend) for one page of the workspace's campaigns on one ad account. Get `adAccountId` from `facebookMarketingMessages.adAccounts.list` or a campaign's `adAccountId` in `facebookMarketingMessages.campaigns.list`; it defaults to the account of the newest campaign, and `adAccounts` lists every account the workspace has campaigns on. `since`/`until` (YYYY-MM-DD, ad account timezone, echoed as `timezone`) default to the last 30 days including today. `search` matches a campaign's exact `campaignId` or part of its name. A metric is null when Meta has no data for it (no delivery in the range, or a region Meta excludes). Money is in major units of `currency`; rates are percentages. `aggregate` is Meta's own totals/averages over exactly the returned page; `aggregateUnavailable` is true when that call failed while the rows succeeded.",
        tags: TAGS,
      })
      .input(statisticsInputSchema)
      .output(statisticsOutputSchema)
      .errors(possibleErrorsOnListingResource)
      .handler(
        async ({ context, input }) =>
          await getMarketingMessagesStatistics(context.workspace, input),
      ),
  },
}
