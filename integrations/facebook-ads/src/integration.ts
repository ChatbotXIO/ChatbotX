import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import {
  getAdAccountDetails,
  getAdAccounts,
  getCustomAudiences,
} from "./apis/ad-accounts"
import {
  createAdCreative,
  findAdCreativeByOperationId,
} from "./apis/adcreatives"
import { uploadAdImage } from "./apis/adimages"
import {
  createAd,
  findAdByOperationId,
  listAdsByIds,
  updateAdStatus,
} from "./apis/ads"
import {
  createAdSet,
  findAdSetByOperationId,
  updateAdSetStatus,
} from "./apis/adsets"
import { getAdVideoStatus, uploadAdVideo } from "./apis/advideos"
import {
  buildHashedPayload,
  buildPageUidPayload,
  bulkSyncHashedAudienceUsers,
  getAudienceMarketingMessagesPage,
  mutateAudienceUsers,
} from "./apis/audience-users"
import { revokeToken } from "./apis/auth"
import {
  createCampaign,
  findCampaignByOperationId,
  getCampaign,
  listCampaignsByIds,
  updateCampaignStatus,
} from "./apis/campaigns"
import { createCustomAudience } from "./apis/custom-audiences"
import { getAdInsights, getMessagingAdsInsightsByAdIds } from "./apis/insights"
import { FacebookAdsException } from "./exception"
import type {
  FacebookAdsActions,
  FacebookAdsAuthValue,
  FacebookAdsConfig,
} from "./schemas"

const config: IntegrationDefinition<
  FacebookAdsConfig,
  FacebookAdsAuthValue,
  FacebookAdsActions
> = {
  name: "facebookAds",
  actions: {
    getAdAccounts: ({ ctx }) =>
      getAdAccounts(ctx.auth.accessToken, ctx.auth.version),
    getCustomAudiences: ({ ctx, props }) =>
      getCustomAudiences(
        ctx.auth.accessToken,
        props.adAccountId,
        ctx.auth.version,
      ),
    getAdInsights: ({ ctx, props }) =>
      getAdInsights({
        accessToken: ctx.auth.accessToken,
        adAccountId: props.adAccountId,
        since: props.since,
        until: props.until,
        version: ctx.auth.version,
        timeIncrement: props.timeIncrement,
      }),
    createCustomAudience: ({ ctx, props }) =>
      createCustomAudience({
        accessToken: ctx.auth.accessToken,
        adAccountId: props.adAccountId,
        name: props.name,
        description: props.description,
        version: ctx.auth.version,
      }),
    bulkSyncHashedAudienceUsers: ({ ctx, props }) =>
      bulkSyncHashedAudienceUsers({
        accessToken: ctx.auth.accessToken,
        customAudienceId: props.customAudienceId,
        contacts: props.contacts,
        operation: props.operation,
        fallbackCountry: props.fallbackCountry,
        version: ctx.auth.version,
      }),
    syncAudienceUser: async ({ ctx, props }): Promise<void> => {
      const { accessToken, version } = ctx.auth

      const marketingPageId = await getAudienceMarketingMessagesPage(
        accessToken,
        props.customAudienceId,
        version,
      )

      let payload: ReturnType<typeof buildPageUidPayload> | null
      if (marketingPageId) {
        payload = await buildHashedPayload(props.contact, props.fallbackCountry)
        if (!payload) {
          throw new FacebookAdsException(
            "Contact has no email or phone number to match against the marketing message audience",
            400,
            "missingContactData",
          )
        }
      } else {
        if (!(props.psid && props.pageId)) {
          throw new FacebookAdsException(
            "Contact is not a Messenger subscriber; normal custom audiences require a page-scoped user id",
            400,
            "missingMessengerIdentity",
          )
        }
        payload = buildPageUidPayload({
          psid: props.psid,
          pageId: props.pageId,
        })
      }

      await mutateAudienceUsers({
        accessToken,
        customAudienceId: props.customAudienceId,
        operation: props.operation,
        payload,
        version,
      })
    },

    // --- Messaging ads (CTM/CTID/CTWA) --------------------------------
    getAdAccountDetails: ({ ctx, props }) =>
      getAdAccountDetails(
        ctx.auth.accessToken,
        props.adAccountId,
        ctx.auth.version,
      ),
    createMessagingCampaign: ({ ctx, props }) =>
      createCampaign({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    findMessagingCampaignByOperationId: ({ ctx, props }) =>
      findCampaignByOperationId({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    updateMessagingCampaignStatus: ({ ctx, props }) =>
      updateCampaignStatus({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    getMessagingCampaign: ({ ctx, props }) =>
      getCampaign({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    listMessagingCampaignsByIds: ({ ctx, props }) =>
      listCampaignsByIds({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    createMessagingAdSet: ({ ctx, props }) =>
      createAdSet({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    findMessagingAdSetByOperationId: ({ ctx, props }) =>
      findAdSetByOperationId({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    updateMessagingAdSetStatus: ({ ctx, props }) =>
      updateAdSetStatus({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    createMessagingAdCreative: ({ ctx, props }) =>
      createAdCreative({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    findMessagingAdCreativeByOperationId: ({ ctx, props }) =>
      findAdCreativeByOperationId({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    createMessagingAd: ({ ctx, props }) =>
      createAd({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    findMessagingAdByOperationId: ({ ctx, props }) =>
      findAdByOperationId({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    updateMessagingAdStatus: ({ ctx, props }) =>
      updateAdStatus({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    listMessagingAdsByIds: ({ ctx, props }) =>
      listAdsByIds({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    getMessagingAdsInsights: ({ ctx, props }) =>
      getMessagingAdsInsightsByAdIds({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    uploadMessagingAdImage: ({ ctx, props }) =>
      uploadAdImage({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    uploadMessagingAdVideo: ({ ctx, props }) =>
      uploadAdVideo({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
    getMessagingAdVideoStatus: ({ ctx, props }) =>
      getAdVideoStatus({
        accessToken: ctx.auth.accessToken,
        version: ctx.auth.version,
        ...props,
      }),
  },
  handleRequest: () => {
    throw SdkException.methodNotImplemented()
  },
  disconnect: async (auth: FacebookAdsAuthValue): Promise<void> => {
    await revokeToken(auth.accessToken, auth.version)
  },
}

export const integration = new Integration(config)
