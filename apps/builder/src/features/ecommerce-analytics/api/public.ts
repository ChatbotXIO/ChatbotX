import { ecommerceAnalyticsService } from "@chatbotx.io/business"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  ecommerceAnalyticsResource,
  getEcommerceAnalyticsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const ecommerceAnalyticsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ecommerce/analytics",
      summary: "Get sales analytics",
      description:
        "The store's sales dashboard for a period: lifetime sales, the period's sales, orders and items sold with the change against the period before, sales and orders by hour (one day) or by day, and the top 10 products and vendors. Cancelled orders are not counted; amounts are in the store currency (`ecommerceSettings.get`).",
      tags: ["Ecommerce"],
    })
    .input(getEcommerceAnalyticsPublicRequest)
    .output(ecommerceAnalyticsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await ecommerceAnalyticsService.getDashboard({
          workspaceId: context.workspace.id,
          from: input.from,
          to: input.to,
        }),
    ),
}
