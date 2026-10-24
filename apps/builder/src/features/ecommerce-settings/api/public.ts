import { ecommerceSettingsService } from "@chatbotx.io/business"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingEcommerceSettings,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { getEcommerceSettings } from "../lib/get-ecommerce-settings"
import {
  ecommerceSettingsPublicResource,
  updateEcommerceSettingsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const ecommerceSettingsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ecommerce/settings",
      summary: "Get store settings",
      description:
        "The store's general, payment, shipping and checkout settings. A workspace that never saved any gets the defaults.",
      tags: ["Ecommerce Settings"],
    })
    .output(ecommerceSettingsPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context }) => await getEcommerceSettings(context.workspace.id),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/ecommerce/settings",
      summary: "Update store settings",
      description:
        'Send only the groups and fields to change, e.g. `{"payments":{"currency":"VND","currencySymbol":"₫","currencyPosition":"after"}}`. `checkoutMode` `externalLink` needs `checkoutLink`; `flow` needs `checkoutFlowId` from `flows.list`. `shippingType` `pickup` needs `storeAddress`. `defaultShippingCountry` must be in `shippingCountries`.',
      tags: ["Ecommerce Settings"],
    })
    .input(updateEcommerceSettingsPublicRequest)
    .output(ecommerceSettingsPublicResource)
    .errors(possibleErrorsOnUpdatingEcommerceSettings)
    .handler(async ({ context, input }) => {
      await ecommerceSettingsService.update({
        workspaceId: context.workspace.id,
        patch: input,
      })
      return await getEcommerceSettings(context.workspace.id)
    }),
}
