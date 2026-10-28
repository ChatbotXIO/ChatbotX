import {
  paymentProviderService,
  resolveWorkspaceAppUrl,
} from "@chatbotx.io/business"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import {
  possibleErrorsOnConnectingPaymentProvider,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { getPaymentProviders } from "../lib/get-payment-providers"
import { paymentIntegrationPath } from "../lib/stripe-connect"
import {
  disconnectPaymentProviderRequest,
  listPaymentProvidersResponse,
  paymentProviderConnectLinkRequest,
  paymentProviderConnectLinkResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const paymentProvidersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/payment-providers",
      summary: "List payment providers",
      description:
        "The store's connected Stripe and PayPal accounts, which the web shop can take online payments with once enabled in `ecommerceSettings.update` (`payments.paymentMethods`). Never returns a key.",
      tags: ["Payment Providers"],
    })
    .output(listPaymentProvidersResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) => await getPaymentProviders(context.workspace),
    ),

  getConnectLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/payment-providers/{provider}/connect-link",
      summary: "Get payment provider connect link",
      description:
        "Where a super admin of this workspace connects Stripe (Stripe Connect sign-in) or PayPal (Client ID and Secret): the provider's row on Settings → Integrations. Give `url` to the store owner, then check the result with `paymentProviders.list`. Connecting is never done with a workspace token, since it decides which account receives the store's money.",
      tags: ["Payment Providers"],
    })
    .input(paymentProviderConnectLinkRequest)
    .output(paymentProviderConnectLinkResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      // The workspace's own domain (a reseller's active custom domain), where
      // the store owner's session lives.
      const appUrl = await resolveWorkspaceAppUrl({
        workspaceId: context.workspace.id,
      })
      return {
        url: joinAppUrl(
          appUrl,
          paymentIntegrationPath(context.workspace.id, input.provider),
        ),
      }
    }),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/payment-providers/{provider}",
      summary: "Disconnect payment provider",
      description:
        "Disconnects Stripe or PayPal and stops offering it at checkout (cash on delivery comes back if nothing else is left). Refused with `paymentProviderInUse` while an order paying with it is still pending, accepted or shipped and not refunded (it waits for its money, or cancelling it refunds through the account): complete or cancel those orders first, finding them with `orders.list`. Doing nothing when it is not connected.",
      successStatus: 204,
      tags: ["Payment Providers"],
    })
    .input(disconnectPaymentProviderRequest)
    .errors(possibleErrorsOnConnectingPaymentProvider)
    .handler(async ({ context, input }) => {
      await paymentProviderService.disconnect({
        workspaceId: context.workspace.id,
        provider: input.provider,
      })
    }),
}
