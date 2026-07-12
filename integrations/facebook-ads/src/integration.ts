import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { getAdAccounts, getCustomAudiences } from "./apis/ad-accounts"
import {
  buildHashedPayload,
  buildPageUidPayload,
  getAudienceMarketingMessagesPage,
  mutateAudienceUsers,
} from "./apis/audience-users"
import { revokeToken } from "./apis/auth"
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
  },
  handleRequest: () => {
    throw SdkException.methodNotImplemented()
  },
  disconnect: async (auth: FacebookAdsAuthValue): Promise<void> => {
    await revokeToken(auth.accessToken, auth.version)
  },
}

export const integration = new Integration(config)
