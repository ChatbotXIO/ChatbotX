import {
  contactService,
  type OrderActor,
  orderService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnPlacingOrder,
  possibleErrorsOnTransitioningOrder,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createOrderPublicRequest,
  listOrdersPublicRequest,
  listOrdersPublicResponse,
  orderIdRequest,
  publicOrderDetailResource,
  transitionOrderPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

const API_TOKEN_ACTOR: OrderActor = { type: "apiToken" }

const STATUS_FLOW_DESCRIPTION =
  "Statuses move pending → accepted → shipped → concluded; pending, accepted and shipped orders can be cancelled. Concluded and cancelled are final."

export const ordersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/orders",
      summary: "List orders",
      description:
        "Newest first. Filter by status, source, contact or date range, or search by order number or customer name, phone or email.",
      tags: ["Orders"],
    })
    .input(listOrdersPublicRequest)
    .output(listOrdersPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await orderService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/orders/{id}",
      summary: "Get order",
      description:
        "The order with its lines, as copied from the products when it was placed, and its status history.",
      tags: ["Orders"],
    })
    .input(orderIdRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await orderService.getDetail({
          workspaceId: context.workspace.id,
          orderId: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/orders",
      summary: "Create order",
      description:
        "Places a cash-on-delivery order from product ids (`products.list`). Prices, discounts and taxes come from the products; delivery cost and service fee from the store settings (`ecommerceSettings.get`), in the store currency. Stock is taken from tracked products; an out-of-stock product refuses the whole order. The order starts `pending`.",
      tags: ["Orders"],
    })
    .input(createOrderPublicRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnPlacingOrder)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { contact, ...order } = input
      const contactId = contact
        ? await contactService.resolveIdByIdentifier({
            workspaceId,
            identifier: contact,
          })
        : null
      return await orderService.place({
        ...order,
        workspaceId,
        source: "api",
        actor: API_TOKEN_ACTOR,
        contact: { contactId },
      })
    }),

  accept: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/orders/{id}/accept",
      summary: "Accept order",
      description: `Accepts a pending order. ${STATUS_FLOW_DESCRIPTION}`,
      tags: ["Orders"],
    })
    .input(transitionOrderPublicRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnTransitioningOrder)
    .handler(
      async ({ context, input }) =>
        await orderService.accept({
          workspaceId: context.workspace.id,
          orderId: input.id,
          actor: API_TOKEN_ACTOR,
          message: input.message,
        }),
    ),

  ship: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/orders/{id}/ship",
      summary: "Mark order shipped",
      description: `Marks an accepted order as handed to delivery. ${STATUS_FLOW_DESCRIPTION}`,
      tags: ["Orders"],
    })
    .input(transitionOrderPublicRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnTransitioningOrder)
    .handler(
      async ({ context, input }) =>
        await orderService.ship({
          workspaceId: context.workspace.id,
          orderId: input.id,
          actor: API_TOKEN_ACTOR,
          message: input.message,
        }),
    ),

  conclude: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/orders/{id}/conclude",
      summary: "Complete order",
      description: `Marks an accepted or shipped order as completed; a cash-on-delivery order becomes paid. ${STATUS_FLOW_DESCRIPTION}`,
      tags: ["Orders"],
    })
    .input(transitionOrderPublicRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnTransitioningOrder)
    .handler(
      async ({ context, input }) =>
        await orderService.conclude({
          workspaceId: context.workspace.id,
          orderId: input.id,
          actor: API_TOKEN_ACTOR,
          message: input.message,
        }),
    ),

  cancel: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/orders/{id}/cancel",
      summary: "Cancel order",
      description: `Cancels an order that is not yet completed and puts its stock back; \`message\` is the reason. ${STATUS_FLOW_DESCRIPTION}`,
      tags: ["Orders"],
    })
    .input(transitionOrderPublicRequest)
    .output(publicOrderDetailResource)
    .errors(possibleErrorsOnTransitioningOrder)
    .handler(
      async ({ context, input }) =>
        await orderService.cancel({
          workspaceId: context.workspace.id,
          orderId: input.id,
          actor: API_TOKEN_ACTOR,
          message: input.message,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/orders/{id}",
      summary: "Delete order",
      description:
        "Permanently deletes the order with its lines and history. An order not yet completed or cancelled puts its stock back first. Use `orders.list` to find the id.",
      successStatus: 204,
      tags: ["Orders"],
    })
    .input(orderIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await orderService.delete({
        workspaceId: context.workspace.id,
        orderId: input.id,
      })
    }),
}
