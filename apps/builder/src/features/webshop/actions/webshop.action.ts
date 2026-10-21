"use server"

import { webshopService } from "@chatbotx.io/business"
import { actionClient } from "@/lib/safe-action"
import { runShopAction } from "../lib/shop-action"
import {
  applyDiscountCodeRequest,
  changeCartRequest,
  checkoutRequest,
  rateOrderRequest,
  removeDiscountCodeRequest,
} from "../schema/action"

/** Adds to a line, or sets its quantity (0 removes it); returns the cart. */
export const changeCartAction = actionClient
  .inputSchema(changeCartRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(parsedInput, async (shopper) => {
        const change = {
          workspaceId: shopper.workspaceId,
          contactId: shopper.contactId,
          contactInboxId: shopper.contactInboxId,
          productId: parsedInput.productId,
          variantId: parsedInput.variantId,
          quantity: parsedInput.quantity,
        }
        const cart =
          parsedInput.mode === "add"
            ? await webshopService.addToCart(change)
            : await webshopService.setCartQuantity(change)
        return {
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        }
      }),
  )

/** Places the cart as a cash-on-delivery order; returns the order to open. */
export const checkoutAction = actionClient.inputSchema(checkoutRequest).action(
  async ({ parsedInput }) =>
    await runShopAction(parsedInput, async (shopper) => {
      const { workspaceId: _workspaceId, token: _token, ...form } = parsedInput
      const order = await webshopService.checkout({
        shopper,
        form: { ...form, customerEmail: form.customerEmail || null },
      })
      return { orderId: order.id, total: order.total, currency: order.currency }
    }),
)

export const rateOrderAction = actionClient
  .inputSchema(rateOrderRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(parsedInput, async (shopper) => {
        const order = await webshopService.rateOrder({
          workspaceId: shopper.workspaceId,
          contactId: shopper.contactId,
          orderId: parsedInput.orderId,
          rating: parsedInput.rating,
          comment: parsedInput.comment,
        })
        return { rating: order.rating, ratingComment: order.ratingComment }
      }),
  )

/**
 * Keeps a discount code on the cart. A code that cannot be used is not kept
 * and comes back as its reason, for the page to translate.
 */
export const applyDiscountCodeAction = actionClient
  .inputSchema(applyDiscountCodeRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(parsedInput, async (shopper) => {
        const quote = await webshopService.applyDiscountCode({
          workspaceId: shopper.workspaceId,
          contactId: shopper.contactId,
          contactInboxId: shopper.contactInboxId,
          code: parsedInput.code,
          shippingType: parsedInput.shippingType,
        })
        return { discountError: quote.discountError }
      }),
  )

export const removeDiscountCodeAction = actionClient
  .inputSchema(removeDiscountCodeRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(parsedInput, async (shopper) => {
        await webshopService.removeDiscountCode({
          workspaceId: shopper.workspaceId,
          contactId: shopper.contactId,
        })
        return { removed: true }
      }),
  )
