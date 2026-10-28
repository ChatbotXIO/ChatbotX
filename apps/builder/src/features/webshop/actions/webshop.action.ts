"use server"

import { webshopService } from "@chatbotx.io/business"
import { actionClient } from "@/lib/safe-action"
import {
  countPreviewCartItems,
  MAX_PREVIEW_CART_LINES,
  readPreviewCart,
  writePreviewCart,
} from "../lib/preview-cart"
import { runShopAction } from "../lib/shop-action"
import {
  applyDiscountCodeRequest,
  changeCartRequest,
  checkoutRequest,
  payOrderRequest,
  rateOrderRequest,
  removeDiscountCodeRequest,
} from "../schema/action"

/** Adds to a line, or sets its quantity (0 removes it); returns the cart. */
export const changeCartAction = actionClient
  .inputSchema(changeCartRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(
        parsedInput,
        async (shopper) => {
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
        },
        async (workspaceId) => {
          const cart = await readPreviewCart(workspaceId)
          const items = await webshopService.changePreviewCart({
            workspaceId,
            items: cart.items,
            productId: parsedInput.productId,
            variantId: parsedInput.variantId,
            quantity: parsedInput.quantity,
            mode: parsedInput.mode,
            maxLines: MAX_PREVIEW_CART_LINES,
          })
          const next = { ...cart, items }
          await writePreviewCart(workspaceId, next)
          return { itemCount: countPreviewCartItems(next) }
        },
      ),
  )

/**
 * Places the cart as an order; returns the order to open, or — paid online —
 * the provider's page to go to first (`paymentUrl`).
 */
export const checkoutAction = actionClient.inputSchema(checkoutRequest).action(
  async ({ parsedInput }) =>
    await runShopAction(parsedInput, async (shopper) => {
      const { workspaceId: _workspaceId, token: _token, ...form } = parsedInput
      const { order, paymentUrl } = await webshopService.checkout({
        shopper,
        form: { ...form, customerEmail: form.customerEmail || null },
      })
      return {
        orderId: order.id,
        total: order.total,
        currency: order.currency,
        paymentUrl,
      }
    }),
)

/** The provider's page for the shopper's own order still waiting for its payment. */
export const payOrderAction = actionClient.inputSchema(payOrderRequest).action(
  async ({ parsedInput }) =>
    await runShopAction(parsedInput, async (shopper) => {
      const { url } = await webshopService.payCustomerOrder({
        workspaceId: shopper.workspaceId,
        contactId: shopper.contactId,
        orderId: parsedInput.orderId,
      })
      return { paymentUrl: url }
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
      await runShopAction(
        parsedInput,
        async (shopper) => {
          const quote = await webshopService.applyDiscountCode({
            workspaceId: shopper.workspaceId,
            contactId: shopper.contactId,
            contactInboxId: shopper.contactInboxId,
            code: parsedInput.code,
            shippingType: parsedInput.shippingType,
          })
          return { discountError: quote.discountError }
        },
        async (workspaceId) => {
          const cart = await readPreviewCart(workspaceId)
          const quote = await webshopService.quotePreviewDiscountCode({
            workspaceId,
            items: cart.items,
            code: parsedInput.code,
            shippingType: parsedInput.shippingType,
          })
          if (!quote.discountError) {
            await writePreviewCart(workspaceId, {
              ...cart,
              discountCode: parsedInput.code.trim(),
            })
          }
          return { discountError: quote.discountError }
        },
      ),
  )

export const removeDiscountCodeAction = actionClient
  .inputSchema(removeDiscountCodeRequest)
  .action(
    async ({ parsedInput }) =>
      await runShopAction(
        parsedInput,
        async (shopper) => {
          await webshopService.removeDiscountCode({
            workspaceId: shopper.workspaceId,
            contactId: shopper.contactId,
          })
          return { removed: true }
        },
        async (workspaceId) => {
          const cart = await readPreviewCart(workspaceId)
          await writePreviewCart(workspaceId, { ...cart, discountCode: null })
          return { removed: true }
        },
      ),
  )
