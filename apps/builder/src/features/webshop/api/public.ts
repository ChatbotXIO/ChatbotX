import {
  contactService,
  createWebshopLink,
  webshopService,
} from "@chatbotx.io/business"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  getCartPublicRequest,
  getCartPublicResponse,
  getWebshopLinkPublicRequest,
  getWebshopLinkPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const webshopPublicRouter = {
  getLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webshop/link",
      summary: "Get shop link",
      description:
        "Returns a link to the web shop signed for one customer: they browse, fill their cart and place a cash-on-delivery order as that contact, and get the order messages in their conversation. Without a contact it is a preview link that cannot order. Optionally opens on a vendor (`productVendors.list`), a category (`productCategories.list`) or the cart. In a bot button, use the shop URL with `?token={{shop_token}}` instead, which is signed for whoever receives it.",
      tags: ["Web shop"],
    })
    .input(getWebshopLinkPublicRequest)
    .output(getWebshopLinkPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = input.contact
        ? await contactService.resolveIdByIdentifier({
            workspaceId,
            identifier: input.contact,
          })
        : null
      return await createWebshopLink({
        workspaceId,
        contactId,
        page: input.page,
        vendorId: input.vendorId,
        categoryId: input.categoryId,
      })
    }),
}

export const cartsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/carts/{identifier}",
      summary: "Get cart",
      description:
        "The customer's current web shop cart, priced as an order would be right now with the store settings (`ecommerceSettings.get`). An empty cart has no items. Items sent from a WhatsApp catalog land here too.",
      tags: ["Web shop"],
    })
    .input(getCartPublicRequest)
    .output(getCartPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        workspaceId,
        identifier: input.identifier,
      })
      return await webshopService.getCart({ workspaceId, contactId })
    }),
}
