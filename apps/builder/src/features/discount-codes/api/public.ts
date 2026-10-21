import {
  contactService,
  discountCodeService,
  orderService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingDiscountCode,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingDiscountCode,
  possibleIdempotencyErrors,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { toDiscountCodeInput, toDiscountCodePatch } from "../lib/to-input"
import {
  discountCodeIdRequest,
  discountCodeWriteRequest,
  generateDiscountCodePublicResponse,
  listDiscountCodesPublicRequest,
  listDiscountCodesPublicResponse,
  publicDiscountCodeResource,
  setDiscountCodeActivePublicRequest,
  updateDiscountCodePublicRequest,
  validateDiscountCodePublicRequest,
  validateDiscountCodePublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

const TAGS = ["Discount Codes"]

export const discountCodesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/discount-codes",
      summary: "List discount codes",
      description:
        "Discount codes (shown as Coupons in the app) customers use at web shop checkout or that `orders.create` takes as `discountCode`. Newest first. Not the older coupon pools under `coupons.*`.",
      tags: TAGS,
    })
    .input(listDiscountCodesPublicRequest)
    .output(listDiscountCodesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await discountCodeService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/discount-codes/{id}",
      summary: "Get discount code",
      description: "One discount code with how many times it was used.",
      tags: TAGS,
    })
    .input(discountCodeIdRequest)
    .output(publicDiscountCodeResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await discountCodeService.get({
          workspaceId: context.workspace.id,
          discountCodeId: input.id,
        }),
    ),

  generateCode: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/discount-codes/generate-code",
      summary: "Generate discount code",
      description:
        "Suggests a random 8-character code not taken in this workspace, for `discountCodes.create`. Creates nothing.",
      tags: TAGS,
    })
    .output(generateDiscountCodePublicResponse)
    .handler(async ({ context }) => ({
      code: await discountCodeService.generateCode(context.workspace.id),
    })),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/discount-codes",
      summary: "Create discount code",
      description:
        "A code taking a percentage, an amount or the delivery cost off an order — the whole order, one category (`productCategories.list`) or chosen products (`products.list`) — with an optional minimum, usage limits, a customer filter and active dates.",
      tags: TAGS,
    })
    .input(discountCodeWriteRequest)
    .output(publicDiscountCodeResource)
    .errors(possibleErrorsOnCreatingDiscountCode)
    .handler(
      async ({ context, input }) =>
        await discountCodeService.create({
          workspaceId: context.workspace.id,
          ...toDiscountCodeInput(input),
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/discount-codes/{id}",
      summary: "Update discount code",
      description:
        "Changes the fields sent and leaves the rest; the result is checked as a whole code. Orders already placed keep what they were charged.",
      tags: TAGS,
    })
    .input(updateDiscountCodePublicRequest)
    .output(publicDiscountCodeResource)
    .errors(possibleErrorsOnMutatingDiscountCode)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await discountCodeService.update({
        workspaceId: context.workspace.id,
        discountCodeId: id,
        data: toDiscountCodePatch(data),
      })
    }),

  setActive: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/discount-codes/{id}/active",
      summary: "Turn discount code on or off",
      description:
        "Turns the code on or off without changing anything else. An inactive code is refused at checkout and never applies itself.",
      tags: TAGS,
    })
    .input(setDiscountCodeActivePublicRequest)
    .output(publicDiscountCodeResource)
    .errors(possibleErrorsOnMutatingDiscountCode)
    .handler(
      async ({ context, input }) =>
        await discountCodeService.setActive({
          workspaceId: context.workspace.id,
          discountCodeId: input.id,
          isActive: input.isActive,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/discount-codes/{id}",
      summary: "Delete discount code",
      description:
        "Orders that used it keep the code as text and the amount it took off.",
      tags: TAGS,
    })
    .input(discountCodeIdRequest)
    .output(publicDiscountCodeResource)
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await discountCodeService.delete({
          workspaceId: context.workspace.id,
          discountCodeId: input.id,
        }),
    ),

  validate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/discount-codes/validate",
      summary: "Check discount code",
      description:
        "Whether a code can be used on these items (product ids from `products.list`) for this customer right now, and what it takes off — priced exactly as `orders.create` would. Uses nothing up.",
      tags: TAGS,
    })
    .input(validateDiscountCodePublicRequest)
    .output(validateDiscountCodePublicResponse)
    .errors({
      ...possibleErrorsOnFindingResource,
      ...possibleIdempotencyErrors,
    })
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = input.contact
        ? await contactService.resolveIdByIdentifier({
            workspaceId,
            identifier: input.contact,
          })
        : null
      const quote = await orderService.quote({
        workspaceId,
        items: input.items,
        shippingType: input.shippingType,
        contactId,
        discountCode: input.code,
      })
      return {
        valid: quote.discountError === null && quote.discount !== null,
        amount: quote.discount?.amount ?? 0,
        currency: quote.currency,
        error: quote.discountError,
        total: quote.totals.total,
      }
    }),
}
